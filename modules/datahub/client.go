// Copyright 2024 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: MIT

package datahub

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"

	"forgejo.org/modules/json"
	"forgejo.org/modules/setting"
)

const defaultDiffRowLimit = 50

type Client struct {
	baseURL      string
	serviceToken string
	httpClient   *http.Client
}

type manifestPage struct {
	Total   int             `json:"total"`
	Entries []manifestEntry `json:"entries"`
}

type rawJSON []byte

func (raw *rawJSON) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		*raw = nil
		return nil
	}
	*raw = append((*raw)[:0], data...)
	return nil
}

type manifestEntry struct {
	RowHash string  `json:"row_hash"`
	Row     rawJSON `json:"row"`
	Content rawJSON `json:"content"`
	JSON    rawJSON `json:"json"`
	Data    rawJSON `json:"data"`
	RawJSON rawJSON `json:"raw_json"`
	Raw     rawJSON `json:"raw"`
}

var (
	defaultClient     *Client
	defaultClientOnce sync.Once
)

func DefaultClient() *Client {
	defaultClientOnce.Do(func() {
		defaultClient = &Client{
			baseURL:      strings.TrimRight(setting.DataHub.CoreURL, "/"),
			serviceToken: setting.DataHub.ServiceToken,
			httpClient:   &http.Client{},
		}
	})
	return defaultClient
}

func ResetDefaultClient() {
	defaultClientOnce = sync.Once{}
	defaultClient = nil
}

func (c *Client) do(ctx context.Context, method, path string, body []byte) ([]byte, int, error) {
	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bodyReader)
	if err != nil {
		return nil, 0, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("X-Service-Token", c.serviceToken)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("read response: %w", err)
	}
	return data, resp.StatusCode, nil
}

func escapePath(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}

func (c *Client) CreateRepo(ctx context.Context, repoName string) error {
	payload := fmt.Appendf(nil, `{"name":%q}`, repoName)
	_, status, err := c.do(ctx, http.MethodPost, "/api/v1/repos", payload)
	if err != nil {
		return err
	}
	if status < 200 || status >= 300 {
		return fmt.Errorf("datahub-core returned status %d for CreateRepo", status)
	}
	return nil
}

func (c *Client) DeleteRepo(ctx context.Context, repoName string) error {
	_, status, err := c.do(ctx, http.MethodDelete, "/api/v1/repos/"+repoName, nil)
	if err != nil {
		return err
	}
	if status == http.StatusNotFound {
		return nil
	}
	if status < 200 || status >= 300 {
		return fmt.Errorf("datahub-core returned status %d for DeleteRepo", status)
	}
	return nil
}

func (c *Client) ListRefs(ctx context.Context, repoName string) ([]byte, int, error) {
	return c.do(ctx, http.MethodGet, "/api/v1/repos/"+repoName+"/refs", nil)
}

func (c *Client) GetRef(ctx context.Context, repoName, refType, name string) ([]byte, int, error) {
	return c.do(ctx, http.MethodGet, "/api/v1/repos/"+repoName+"/refs/"+url.PathEscape(refType)+"/"+escapePath(name), nil)
}

func (c *Client) UpdateRef(ctx context.Context, repoName, refType, name string, body []byte) ([]byte, int, error) {
	return c.do(ctx, http.MethodPost, "/api/v1/repos/"+repoName+"/refs/"+url.PathEscape(refType)+"/"+escapePath(name), body)
}

func (c *Client) GetObject(ctx context.Context, repoName, objType, hash string) ([]byte, int, error) {
	return c.do(ctx, http.MethodGet, "/api/v1/repos/"+repoName+"/objects/"+url.PathEscape(objType)+"/"+url.PathEscape(hash), nil)
}

func (c *Client) PushObjects(ctx context.Context, repoName string, body []byte) ([]byte, int, error) {
	return c.do(ctx, http.MethodPost, "/api/v1/repos/"+repoName+"/objects/batch", body)
}

func (c *Client) BatchExists(ctx context.Context, repoName string, body []byte) ([]byte, int, error) {
	return c.do(ctx, http.MethodPost, "/api/v1/repos/"+repoName+"/objects/batch-exists", body)
}

func (c *Client) BatchUpload(ctx context.Context, repoName string, body []byte) ([]byte, int, error) {
	return c.do(ctx, http.MethodPost, "/api/v1/repos/"+repoName+"/objects/batch-upload", body)
}

func (c *Client) GetTree(ctx context.Context, repoName, hash, treePath string) ([]byte, int, error) {
	path := "/api/v1/repos/" + repoName + "/tree/" + url.PathEscape(hash) + "/"
	if strings.Trim(treePath, "/") != "" {
		path += escapePath(treePath)
	}
	return c.do(ctx, http.MethodGet, path, nil)
}

func (c *Client) GetDiff(ctx context.Context, repoName, oldHash, newHash, filePath, offset, limit string) ([]byte, int, error) {
	payload := map[string]any{
		"old_commit":   oldHash,
		"new_commit":   newHash,
		"include_rows": true,
		"limit":        defaultDiffRowLimit,
	}
	if filePath != "" {
		payload["path"] = filePath
	}
	if parsedOffset, err := strconv.Atoi(offset); err == nil && parsedOffset > 0 {
		payload["offset"] = parsedOffset
	}
	if parsedLimit, err := strconv.Atoi(limit); err == nil && parsedLimit > 0 {
		payload["limit"] = parsedLimit
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, 0, fmt.Errorf("encode diff request: %w", err)
	}
	return c.do(ctx, http.MethodPost, "/api/v1/repos/"+repoName+"/diff", body)
}

func (c *Client) GetLog(ctx context.Context, repoName, ref, limit string) ([]byte, int, error) {
	query := url.Values{}
	query.Set("ref", ref)
	if limit != "" {
		query.Set("limit", limit)
	}
	return c.do(ctx, http.MethodGet, "/api/v1/repos/"+repoName+"/log?"+query.Encode(), nil)
}

func (c *Client) ListPulls(ctx context.Context, repoName, status string) ([]byte, int, error) {
	query := url.Values{}
	if status != "" {
		query.Set("status", status)
	}
	path := "/api/v1/repos/" + repoName + "/pulls"
	if encoded := query.Encode(); encoded != "" {
		path += "?" + encoded
	}
	return c.do(ctx, http.MethodGet, path, nil)
}

func (c *Client) CreatePull(ctx context.Context, repoName string, body []byte) ([]byte, int, error) {
	return c.do(ctx, http.MethodPost, "/api/v1/repos/"+repoName+"/pulls", body)
}

func (c *Client) GetPull(ctx context.Context, repoName, id string) ([]byte, int, error) {
	return c.do(ctx, http.MethodGet, "/api/v1/repos/"+repoName+"/pulls/"+id, nil)
}

func (c *Client) MergePull(ctx context.Context, repoName, id string, body []byte) ([]byte, int, error) {
	return c.do(ctx, http.MethodPost, "/api/v1/repos/"+repoName+"/pulls/"+id+"/merge", body)
}

func (c *Client) ListPullComments(ctx context.Context, repoName, id string) ([]byte, int, error) {
	return c.do(ctx, http.MethodGet, "/api/v1/repos/"+repoName+"/pulls/"+id+"/comments", nil)
}

func (c *Client) CreatePullComment(ctx context.Context, repoName, id string, body []byte) ([]byte, int, error) {
	return c.do(ctx, http.MethodPost, "/api/v1/repos/"+repoName+"/pulls/"+id+"/comments", body)
}

func (c *Client) ListPullReviews(ctx context.Context, repoName, id string) ([]byte, int, error) {
	return c.do(ctx, http.MethodGet, "/api/v1/repos/"+repoName+"/pulls/"+id+"/reviews", nil)
}

func (c *Client) CreatePullReview(ctx context.Context, repoName, id string, body []byte) ([]byte, int, error) {
	return c.do(ctx, http.MethodPost, "/api/v1/repos/"+repoName+"/pulls/"+id+"/reviews", body)
}

func (c *Client) GetManifest(ctx context.Context, repoName, commit, filePath, offset, limit string) ([]byte, int, error) {
	path := "/api/v1/repos/" + repoName + "/manifest/" + url.PathEscape(commit) + "/" + escapePath(filePath)
	query := url.Values{}
	if offset != "" {
		query.Set("offset", offset)
	}
	if limit != "" {
		query.Set("limit", limit)
	}
	if encoded := query.Encode(); encoded != "" {
		path += "?" + encoded
	}
	return c.do(ctx, http.MethodGet, path, nil)
}

func (c *Client) ExportFile(ctx context.Context, repoName, commitHash, filePath, format string) ([]byte, int, error) {
	path := "/api/v1/repos/" + repoName + "/export/" + url.PathEscape(commitHash) + "/" + escapePath(filePath)
	query := url.Values{}
	if format != "" {
		query.Set("format", format)
	}
	if encoded := query.Encode(); encoded != "" {
		path += "?" + encoded
	}
	return c.do(ctx, http.MethodGet, path, nil)
}

func (c *Client) ExportFileWithFallback(ctx context.Context, repoName, commitHash, filePath, format string) ([]byte, int, error) {
	data, status, err := c.ExportFile(ctx, repoName, commitHash, filePath, format)
	if err != nil || status != http.StatusNotFound || (format != "" && format != "jsonl") {
		return data, status, err
	}
	return c.exportJSONLFromManifest(ctx, repoName, commitHash, filePath)
}

func (c *Client) exportJSONLFromManifest(ctx context.Context, repoName, commitHash, filePath string) ([]byte, int, error) {
	const pageSize = 500
	var output bytes.Buffer
	offset := 0

	for {
		data, status, err := c.GetManifest(ctx, repoName, commitHash, filePath, strconv.Itoa(offset), strconv.Itoa(pageSize))
		if err != nil || status < 200 || status >= 300 {
			return data, status, err
		}

		var page manifestPage
		if err := json.Unmarshal(data, &page); err != nil {
			return nil, 0, fmt.Errorf("decode manifest page: %w", err)
		}
		if len(page.Entries) == 0 {
			break
		}

		for _, entry := range page.Entries {
			raw := entry.inlineRow()
			if len(raw) == 0 && entry.RowHash != "" {
				rowData, rowStatus, err := c.GetObject(ctx, repoName, "rows", entry.RowHash)
				if err != nil || rowStatus < 200 || rowStatus >= 300 {
					if err != nil {
						return nil, 0, err
					}
					return rowData, rowStatus, nil
				}
				raw = rowData
			}
			if len(raw) == 0 {
				return nil, 0, fmt.Errorf("manifest entry at offset %d has no row content", offset)
			}

			if !json.Valid(raw) {
				return nil, 0, fmt.Errorf("invalid row JSON at offset %d", offset)
			}
			output.Write(bytes.TrimSpace(raw))
			output.WriteByte('\n')
		}

		offset += len(page.Entries)
		if page.Total > 0 && offset >= page.Total {
			break
		}
		if len(page.Entries) < pageSize {
			break
		}
	}

	return output.Bytes(), http.StatusOK, nil
}

func (entry manifestEntry) inlineRow() []byte {
	for _, raw := range []rawJSON{entry.Row, entry.Content, entry.JSON, entry.Data, entry.RawJSON, entry.Raw} {
		if len(raw) > 0 && string(raw) != "null" {
			return raw
		}
	}
	return nil
}

func (c *Client) MetaCompute(ctx context.Context, repoName string, body []byte) ([]byte, int, error) {
	return c.do(ctx, http.MethodPost, "/api/v1/repos/"+repoName+"/meta/compute", body)
}

func (c *Client) MetaGet(ctx context.Context, repoName, commit, filePath string) ([]byte, int, error) {
	return c.do(ctx, http.MethodGet, "/api/v1/repos/"+repoName+"/meta/"+url.PathEscape(commit)+"/"+escapePath(filePath), nil)
}

func (c *Client) MetaSummary(ctx context.Context, repoName, commit, filePath string) ([]byte, int, error) {
	return c.do(ctx, http.MethodGet, "/api/v1/repos/"+repoName+"/meta/"+url.PathEscape(commit)+"/"+escapePath(filePath)+"/summary", nil)
}

func (c *Client) MetaDiff(ctx context.Context, repoName, oldCommit, newCommit, filePath string) ([]byte, int, error) {
	path := "/api/v1/repos/" + repoName + "/meta/diff/" + oldCommit + "/" + newCommit
	if filePath != "" {
		path += "?file=" + url.QueryEscape(filePath)
	}
	return c.do(ctx, http.MethodGet, path, nil)
}

func (c *Client) GetStats(ctx context.Context, repoName, commitHash, pathFilter, includeSize string) ([]byte, int, error) {
	path := "/api/v1/repos/" + repoName + "/stats/" + commitHash
	query := url.Values{}
	if pathFilter != "" {
		query.Set("path", pathFilter)
	}
	if includeSize != "" {
		query.Set("include_size", includeSize)
	}
	if encoded := query.Encode(); encoded != "" {
		path += "?" + encoded
	}
	return c.do(ctx, http.MethodGet, path, nil)
}

func (c *Client) Search(ctx context.Context, repoName string, body []byte) ([]byte, int, error) {
	return c.do(ctx, http.MethodPost, "/api/v1/repos/"+repoName+"/search", body)
}

func (c *Client) Validate(ctx context.Context, repoName string, body []byte) ([]byte, int, error) {
	return c.do(ctx, http.MethodPost, "/api/v1/repos/"+repoName+"/validate", body)
}

func (c *Client) ReportCheck(ctx context.Context, repoName string, body []byte) ([]byte, int, error) {
	return c.do(ctx, http.MethodPost, "/api/v1/repos/"+repoName+"/checks", body)
}

func (c *Client) GetChecks(ctx context.Context, repoName, commitHash string) ([]byte, int, error) {
	return c.do(ctx, http.MethodGet, "/api/v1/repos/"+repoName+"/checks/"+commitHash, nil)
}

func (c *Client) GetBlame(ctx context.Context, repoName, commitHash, filePath, row string) ([]byte, int, error) {
	path := "/api/v1/repos/" + repoName + "/blame/" + commitHash + "/" + filePath
	if row != "" {
		path += "?row=" + url.QueryEscape(row)
	}
	return c.do(ctx, http.MethodGet, path, nil)
}

func (c *Client) RunGC(ctx context.Context, repoName string, body []byte) ([]byte, int, error) {
	return c.do(ctx, http.MethodPost, "/api/v1/repos/"+repoName+"/gc", body)
}

func (c *Client) GetDedup(ctx context.Context, repoName, commitHash, pathFilter string) ([]byte, int, error) {
	path := "/api/v1/repos/" + repoName + "/dedup/" + commitHash
	if pathFilter != "" {
		path += "?path=" + url.QueryEscape(pathFilter)
	}
	return c.do(ctx, http.MethodGet, path, nil)
}
