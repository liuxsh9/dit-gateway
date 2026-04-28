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
	"strings"
	"sync"

	"forgejo.org/modules/setting"
)

type Client struct {
	baseURL      string
	serviceToken string
	httpClient   *http.Client
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
	payload := []byte(fmt.Sprintf(`{"name":%q}`, repoName))
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
	return c.do(ctx, http.MethodGet, "/api/v1/repos/"+repoName+"/refs/"+refType+"/"+name, nil)
}

func (c *Client) UpdateRef(ctx context.Context, repoName, refType, name string, body []byte) ([]byte, int, error) {
	return c.do(ctx, http.MethodPost, "/api/v1/repos/"+repoName+"/refs/"+refType+"/"+name, body)
}

func (c *Client) GetObject(ctx context.Context, repoName, objType, hash string) ([]byte, int, error) {
	return c.do(ctx, http.MethodGet, "/api/v1/repos/"+repoName+"/objects/"+url.PathEscape(objType)+"/"+url.PathEscape(hash), nil)
}

func (c *Client) PushObjects(ctx context.Context, repoName string, body []byte) ([]byte, int, error) {
	return c.do(ctx, http.MethodPost, "/api/v1/repos/"+repoName+"/objects/batch", body)
}

func (c *Client) GetTree(ctx context.Context, repoName, hash string) ([]byte, int, error) {
	return c.do(ctx, http.MethodGet, "/api/v1/repos/"+repoName+"/tree/"+url.PathEscape(hash)+"/", nil)
}

func (c *Client) GetDiff(ctx context.Context, repoName, oldHash, newHash string) ([]byte, int, error) {
	body := []byte(fmt.Sprintf(
		`{"old_commit":%q,"new_commit":%q,"include_rows":true,"limit":100}`,
		oldHash,
		newHash,
	))
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

func (c *Client) MetaCompute(ctx context.Context, repoName string, body []byte) ([]byte, int, error) {
	return c.do(ctx, http.MethodPost, "/api/v1/repos/"+repoName+"/meta/compute", body)
}

func (c *Client) MetaGet(ctx context.Context, repoName, commit, filePath string) ([]byte, int, error) {
	return c.do(ctx, http.MethodGet, "/api/v1/repos/"+repoName+"/meta/"+commit+"/"+filePath, nil)
}

func (c *Client) MetaSummary(ctx context.Context, repoName, commit, filePath string) ([]byte, int, error) {
	return c.do(ctx, http.MethodGet, "/api/v1/repos/"+repoName+"/meta/"+commit+"/"+filePath+"/summary", nil)
}

func (c *Client) MetaDiff(ctx context.Context, repoName, oldCommit, newCommit, filePath string) ([]byte, int, error) {
	path := "/api/v1/repos/" + repoName + "/meta/diff/" + oldCommit + "/" + newCommit
	if filePath != "" {
		path += "?file=" + url.QueryEscape(filePath)
	}
	return c.do(ctx, http.MethodGet, path, nil)
}

func (c *Client) GetStats(ctx context.Context, repoName, commitHash, pathFilter string) ([]byte, int, error) {
	path := "/api/v1/repos/" + repoName + "/stats/" + commitHash
	if pathFilter != "" {
		path += "?path=" + url.QueryEscape(pathFilter)
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
