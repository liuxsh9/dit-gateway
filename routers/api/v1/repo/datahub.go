// Copyright 2024 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: MIT

package repo

import (
	std_context "context"
	"errors"
	"fmt"
	"io"
	"maps"
	"net/http"
	"strings"

	git_model "forgejo.org/models/git"
	repo_model "forgejo.org/models/repo"
	unit_model "forgejo.org/models/unit"
	user_model "forgejo.org/models/user"
	"forgejo.org/modules/datahub"
	"forgejo.org/modules/json"
	"forgejo.org/modules/setting"
	"forgejo.org/services/context"
	"forgejo.org/services/convert"
)

func proxyToDatahub(ctx *context.APIContext, fn func() ([]byte, int, error)) {
	proxyToDatahubWithContentType(ctx, "application/json", fn)
}

func proxyToDatahubWithContentType(ctx *context.APIContext, contentType string, fn func() ([]byte, int, error)) {
	if !setting.DataHub.Enabled {
		ctx.NotFound()
		return
	}
	if !ctx.Repo.Repository.IsDataRepo {
		ctx.NotFound()
		return
	}
	data, status, err := fn()
	if err != nil {
		if statusErr, ok := err.(interface {
			StatusCode() int
			Body() []byte
		}); ok {
			ctx.Resp.Header().Set("Content-Type", contentType)
			ctx.Resp.WriteHeader(statusErr.StatusCode())
			_, _ = ctx.Resp.Write(statusErr.Body())
			return
		}
		if isDatahubProxyCancel(ctx.Req.Context(), err) {
			return
		}
		ctx.Error(http.StatusBadGateway, "datahub proxy", err)
		return
	}
	ctx.Resp.Header().Set("Content-Type", contentType)
	ctx.Resp.WriteHeader(status)
	if ctx.Req.Method == http.MethodHead {
		return
	}
	_, _ = ctx.Resp.Write(data)
}

func isDatahubProxyCancel(reqCtx std_context.Context, err error) bool {
	if errors.Is(err, std_context.Canceled) {
		return true
	}
	return reqCtx != nil && errors.Is(reqCtx.Err(), std_context.Canceled)
}

func readBody(ctx *context.APIContext) ([]byte, bool) {
	body, err := io.ReadAll(ctx.Req.Body)
	if err != nil {
		ctx.Error(http.StatusBadRequest, "readBody", err)
		return nil, false
	}
	return body, true
}

func DatahubListRefs(ctx *context.APIContext) {
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().ListRefs(ctx, ctx.Repo.Repository.Name)
	})
}

func DatahubGetRef(ctx *context.APIContext) {
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().GetRef(ctx, ctx.Repo.Repository.Name, ctx.Params(":ref_type"), datahubParam(ctx, ":name", "*"))
	})
}

func DatahubUpdateRef(ctx *context.APIContext) {
	body, ok := readBody(ctx)
	if !ok {
		return
	}
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().UpdateRef(ctx, ctx.Repo.Repository.Name, ctx.Params(":ref_type"), datahubParam(ctx, ":name", "*"), body)
	})
}

func DatahubGetObject(ctx *context.APIContext) {
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().GetObject(
			ctx,
			ctx.Repo.Repository.Name,
			ctx.Params(":obj_type"),
			ctx.Params(":hash"),
		)
	})
}

func DatahubPushObjects(ctx *context.APIContext) {
	body, ok := readBody(ctx)
	if !ok {
		return
	}
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().PushObjects(ctx, ctx.Repo.Repository.Name, body)
	})
}

func DatahubBatchExists(ctx *context.APIContext) {
	body, ok := readBody(ctx)
	if !ok {
		return
	}
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().BatchExists(ctx, ctx.Repo.Repository.Name, body)
	})
}

func DatahubBatchUpload(ctx *context.APIContext) {
	body, ok := readBody(ctx)
	if !ok {
		return
	}
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().BatchUpload(ctx, ctx.Repo.Repository.Name, body)
	})
}

func DatahubGetTree(ctx *context.APIContext) {
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		commit, err := datahubCommitForCore(ctx, ctx.Params(":hash"))
		if err != nil {
			return nil, http.StatusBadRequest, err
		}
		return datahub.DefaultClient().GetTree(ctx, ctx.Repo.Repository.Name, commit, ctx.Params("*"))
	})
}

func DatahubGetDiff(ctx *context.APIContext) {
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().GetDiff(
			ctx,
			ctx.Repo.Repository.Name,
			ctx.Params(":old"),
			ctx.Params(":new"),
			ctx.FormString("file"),
			ctx.FormString("offset"),
			ctx.FormString("limit"),
		)
	})
}

func DatahubGetLog(ctx *context.APIContext) {
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		ref := datahubRefForCore(ctx, ctx.FormString("ref"), ctx.Params(":ref"), ctx.Params("*"))
		return datahub.DefaultClient().GetLog(ctx, ctx.Repo.Repository.Name, ref, ctx.FormString("limit"))
	})
}

func DatahubListPulls(ctx *context.APIContext) {
	if !setting.DataHub.Enabled {
		ctx.NotFound()
		return
	}
	if !ctx.Repo.Repository.IsDataRepo {
		ctx.NotFound()
		return
	}
	status, ok := normalizeDatahubPullStatus(ctx.FormString("status"))
	if !ok {
		ctx.Error(http.StatusBadRequest, "DatahubListPulls", fmt.Sprintf("unknown pull status: %s", ctx.FormString("status")))
		return
	}
	proxyToDatahubWithContentType(ctx, "application/json", func() ([]byte, int, error) {
		return datahub.DefaultClient().ListPulls(ctx, ctx.Repo.Repository.Name, status)
	})
}

func DatahubDefaultTemplate(ctx *context.APIContext) {
	if !setting.DataHub.Enabled {
		ctx.NotFound()
		return
	}
	if !ctx.Repo.Repository.IsDataRepo {
		ctx.NotFound()
		return
	}
	kind := repo_model.TemplateKind(ctx.FormString("kind"))
	if kind == "" {
		kind = repo_model.TemplateKindPullRequest
	}
	if kind != repo_model.TemplateKindIssue && kind != repo_model.TemplateKindPullRequest {
		ctx.Error(http.StatusBadRequest, "DatahubDefaultTemplate", "unknown template kind")
		return
	}
	tmpl, has, err := repo_model.GetDefaultIssuePRTemplate(ctx, ctx.Repo.Repository.ID, kind)
	if err != nil {
		ctx.Error(http.StatusInternalServerError, "GetDefaultIssuePRTemplate", err)
		return
	}
	if !has {
		ctx.JSON(http.StatusOK, map[string]any{})
		return
	}
	ctx.JSON(http.StatusOK, map[string]any{
		"id":         tmpl.ID,
		"kind":       tmpl.Kind,
		"name":       tmpl.Name,
		"about":      tmpl.About,
		"content":    tmpl.Content,
		"is_default": tmpl.IsDefault,
	})
}

func normalizeDatahubPullStatus(status string) (string, bool) {
	switch status {
	case "", "all":
		return "", true
	case "open", "closed", "merged":
		return status, true
	default:
		return "", false
	}
}

func DatahubCreatePull(ctx *context.APIContext) {
	body, ok := readBody(ctx)
	if !ok {
		return
	}
	body = datahubBodyWithActor(ctx, body)
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().CreatePull(ctx, ctx.Repo.Repository.Name, body)
	})
}

func datahubBodyWithActor(ctx *context.APIContext, body []byte) []byte {
	if ctx.Doer == nil || ctx.Doer.Name == "" {
		return body
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return body
	}
	changed := false
	if author := datahubActorName(payload["author"]); author == "" || datahubPlaceholderActor(author) || datahubActorValueNeedsCurrentUser(payload["author"]) {
		payload["author"] = ctx.Doer.Name
		changed = true
	}
	if _, exists := payload["reviewer"]; exists {
		if reviewer := datahubActorName(payload["reviewer"]); reviewer == "" || datahubPlaceholderActor(reviewer) || datahubActorValueNeedsCurrentUser(payload["reviewer"]) {
			payload["reviewer"] = ctx.Doer.Name
			changed = true
		}
	}
	if !changed {
		return body
	}
	updated, err := json.Marshal(payload)
	if err != nil {
		return body
	}
	return updated
}

func datahubPlaceholderActor(actor string) bool {
	switch strings.ToLower(strings.TrimSpace(actor)) {
	case "", "unknown", "unknown-token", "service-token", "reviewer", "unknown reviewer":
		return true
	default:
		return false
	}
}

func DatahubGetPull(ctx *context.APIContext) {
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		data, status, err := datahub.DefaultClient().GetPull(ctx, ctx.Repo.Repository.Name, ctx.Params(":id"))
		return datahubEnrichPullPayload(ctx, data, status), status, err
	})
}

func DatahubMergePull(ctx *context.APIContext) {
	if !setting.DataHub.Enabled {
		ctx.NotFound()
		return
	}
	if !ctx.Repo.Repository.IsDataRepo {
		ctx.NotFound()
		return
	}

	body, ok := readBody(ctx)
	if !ok {
		return
	}

	pullData, status, err := datahub.DefaultClient().GetPull(ctx, ctx.Repo.Repository.Name, ctx.Params(":id"))
	if err != nil {
		ctx.Error(http.StatusBadGateway, "datahub proxy", err)
		return
	}
	if status < http.StatusOK || status >= http.StatusMultipleChoices {
		ctx.Resp.Header().Set("Content-Type", "application/json")
		ctx.Resp.WriteHeader(status)
		_, _ = ctx.Resp.Write(pullData)
		return
	}
	targetBranch := datahubPullTargetBranch(pullData)
	canMerge, err := datahubCanCurrentUserMerge(ctx, targetBranch)
	if err != nil {
		ctx.Error(http.StatusInternalServerError, "GetFirstMatchProtectedBranchRule", err)
		return
	}
	if !canMerge {
		ctx.Error(http.StatusForbidden, "DatahubMergePull", "user is not allowed to merge this data pull request")
		return
	}

	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().MergePull(ctx, ctx.Repo.Repository.Name, ctx.Params(":id"), body)
	})
}

func datahubPullTargetBranch(payload []byte) string {
	var pull struct {
		TargetRef    string `json:"target_ref"`
		TargetBranch string `json:"target_branch"`
		BaseRef      string `json:"base_ref"`
		BaseBranch   string `json:"base_branch"`
	}
	if err := json.Unmarshal(payload, &pull); err != nil {
		return ""
	}
	for _, branch := range []string{pull.TargetRef, pull.TargetBranch, pull.BaseRef, pull.BaseBranch} {
		if branch != "" {
			return datahubBranchName(branch)
		}
	}
	return ""
}

func datahubBranchName(refName string) string {
	return strings.TrimPrefix(strings.TrimPrefix(refName, "refs/heads/"), "heads/")
}

func datahubCanCurrentUserMerge(ctx *context.APIContext, targetBranch string) (bool, error) {
	if ctx.Doer == nil || !ctx.Repo.CanWrite(unit_model.TypeCode) {
		return false, nil
	}
	if targetBranch == "" {
		return true, nil
	}
	protectedBranchRule, err := git_model.GetFirstMatchProtectedBranchRule(ctx, ctx.Repo.Repository.ID, targetBranch)
	if err != nil {
		return false, err
	}
	if protectedBranchRule == nil {
		return true, nil
	}
	return git_model.IsUserMergeWhitelisted(ctx, protectedBranchRule, ctx.Doer.ID, ctx.Repo.Permission), nil
}

func DatahubListPullComments(ctx *context.APIContext) {
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		data, status, err := datahub.DefaultClient().ListPullComments(ctx, ctx.Repo.Repository.Name, ctx.Params(":id"))
		return datahubEnrichTimelinePayload(ctx, data, status, "author"), status, err
	})
}

func DatahubCreatePullComment(ctx *context.APIContext) {
	body, ok := readBody(ctx)
	if !ok {
		return
	}
	body = datahubBodyWithActor(ctx, body)
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		data, status, err := datahub.DefaultClient().CreatePullComment(ctx, ctx.Repo.Repository.Name, ctx.Params(":id"), body)
		data = datahubEnsureCurrentActorPayload(ctx, data, status, "author")
		return datahubEnrichTimelinePayload(ctx, data, status, "author"), status, err
	})
}

func DatahubUpdatePullComment(ctx *context.APIContext) {
	body, ok := readBody(ctx)
	if !ok {
		return
	}
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().UpdatePullComment(ctx, ctx.Repo.Repository.Name, ctx.Params(":id"), ctx.Params(":comment_id"), body)
	})
}

func DatahubDeletePullComment(ctx *context.APIContext) {
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().DeletePullComment(ctx, ctx.Repo.Repository.Name, ctx.Params(":id"), ctx.Params(":comment_id"))
	})
}

func DatahubListPullReviews(ctx *context.APIContext) {
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		data, status, err := datahub.DefaultClient().ListPullReviews(ctx, ctx.Repo.Repository.Name, ctx.Params(":id"))
		return datahubEnrichTimelinePayload(ctx, data, status, "reviewer", "author"), status, err
	})
}

func DatahubCreatePullReview(ctx *context.APIContext) {
	body, ok := readBody(ctx)
	if !ok {
		return
	}
	body = datahubBodyWithActor(ctx, body)
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		data, status, err := datahub.DefaultClient().CreatePullReview(ctx, ctx.Repo.Repository.Name, ctx.Params(":id"), body)
		data = datahubEnsureCurrentActorPayload(ctx, data, status, "reviewer", "author")
		return datahubEnrichTimelinePayload(ctx, data, status, "reviewer", "author"), status, err
	})
}

func datahubEnsureCurrentActorPayload(ctx *context.APIContext, data []byte, status int, fields ...string) []byte {
	if status < http.StatusOK || status >= http.StatusMultipleChoices || len(data) == 0 || ctx.Doer == nil || ctx.Doer.Name == "" {
		return data
	}

	var payload map[string]any
	if err := json.Unmarshal(data, &payload); err != nil {
		return data
	}
	for _, field := range fields {
		if _, exists := payload[field]; !exists {
			payload[field] = ctx.Doer.Name
		}
	}
	return datahubMarshalOrOriginal(payload, data)
}

func datahubEnrichPullPayload(ctx *context.APIContext, data []byte, status int) []byte {
	if status < http.StatusOK || status >= http.StatusMultipleChoices || len(data) == 0 {
		return data
	}

	var payload map[string]any
	if err := json.Unmarshal(data, &payload); err != nil {
		return data
	}
	datahubEnrichActorField(ctx, payload, "author")
	return datahubMarshalOrOriginal(payload, data)
}

func datahubEnrichTimelinePayload(ctx *context.APIContext, data []byte, status int, fields ...string) []byte {
	if status < http.StatusOK || status >= http.StatusMultipleChoices || len(data) == 0 {
		return data
	}

	var list []map[string]any
	if err := json.Unmarshal(data, &list); err == nil {
		for _, item := range list {
			for _, field := range fields {
				datahubEnrichActorField(ctx, item, field)
			}
		}
		return datahubMarshalOrOriginal(list, data)
	}

	var item map[string]any
	if err := json.Unmarshal(data, &item); err != nil {
		return data
	}
	for _, field := range fields {
		datahubEnrichActorField(ctx, item, field)
	}
	return datahubMarshalOrOriginal(item, data)
}

func datahubEnrichActorField(ctx *context.APIContext, payload map[string]any, field string) {
	userPayload, ok := datahubActorPayload(ctx, payload[field])
	if !ok {
		return
	}
	payload[field] = userPayload
	if field == "author" {
		payload["user"] = userPayload
	}
	if field == "reviewer" {
		payload["user"] = userPayload
	}
}

func datahubActorPayload(ctx *context.APIContext, value any) (map[string]any, bool) {
	value = datahubNormalizeActorValue(value)
	switch actor := value.(type) {
	case string:
		name := strings.TrimSpace(actor)
		if name == "" {
			return nil, false
		}
		return datahubUserPayload(ctx, name), true
	case map[string]any:
		return datahubEnrichedActorPayload(ctx, actor), true
	default:
		return nil, false
	}
}

func datahubEnrichedActorPayload(ctx *context.APIContext, actor map[string]any) map[string]any {
	name := datahubActorName(actor)
	if name != "" {
		user, err := user_model.GetUserByName(ctx, name)
		if err == nil {
			return datahubUserPayloadForUser(ctx, user)
		}
	}

	payload := make(map[string]any, len(actor)+4)
	maps.Copy(payload, actor)
	if name != "" {
		for _, key := range []string{"login", "username", "name"} {
			if strings.TrimSpace(datahubStringField(payload, key)) == "" {
				payload[key] = name
			}
		}
		if strings.TrimSpace(datahubStringField(payload, "html_url")) == "" {
			payload["html_url"] = "/" + name
		}
	}
	if avatarURL := strings.TrimSpace(datahubStringField(payload, "avatar_url")); avatarURL == "" {
		payload["avatar_url"] = ""
	}
	return payload
}

func datahubUserPayload(ctx *context.APIContext, name string) map[string]any {
	name = strings.TrimSpace(name)
	payload := map[string]any{
		"login":      name,
		"username":   name,
		"name":       name,
		"html_url":   "/" + name,
		"avatar_url": "",
	}
	user, err := user_model.GetUserByName(ctx, name)
	if err != nil {
		return payload
	}
	return datahubUserPayloadForUser(ctx, user)
}

func datahubUserPayloadForUser(ctx *context.APIContext, user *user_model.User) map[string]any {
	payload := map[string]any{}
	payload["login"] = user.Name
	payload["username"] = user.Name
	payload["name"] = user.Name
	payload["full_name"] = user.FullName
	payload["avatar_url"] = user.AvatarLinkWithSize(ctx, 0)
	payload["html_url"] = user.HomeLink()
	return payload
}

func datahubActorName(value any) string {
	value = datahubNormalizeActorValue(value)
	switch actor := value.(type) {
	case string:
		return strings.TrimSpace(actor)
	case map[string]any:
		for _, key := range []string{"login", "username", "name", "full_name"} {
			if value := strings.TrimSpace(datahubStringField(actor, key)); value != "" {
				return value
			}
		}
		for _, key := range []string{"author", "reviewer", "user", "poster"} {
			if value := datahubActorName(actor[key]); value != "" {
				return value
			}
		}
	}
	return ""
}

func datahubActorValueNeedsCurrentUser(value any) bool {
	switch actor := value.(type) {
	case string:
		return datahubActorStringPayload(actor) != nil
	default:
		return value != nil
	}
}

func datahubNormalizeActorValue(value any) any {
	if actor, ok := value.(string); ok {
		if payload := datahubActorStringPayload(actor); payload != nil {
			return payload
		}
	}
	return value
}

func datahubActorStringPayload(actor string) map[string]any {
	actor = strings.TrimSpace(actor)
	if !strings.HasPrefix(actor, "{") {
		return nil
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(actor), &payload); err != nil || len(payload) == 0 {
		return nil
	}
	return payload
}

func datahubStringField(payload map[string]any, key string) string {
	value, _ := payload[key].(string)
	return value
}

func datahubMarshalOrOriginal(value any, original []byte) []byte {
	updated, err := json.Marshal(value)
	if err != nil {
		return original
	}
	return updated
}

func DatahubGovernance(ctx *context.APIContext) {
	if !setting.DataHub.Enabled {
		ctx.NotFound()
		return
	}
	if !ctx.Repo.Repository.IsDataRepo {
		ctx.NotFound()
		return
	}

	if err := ctx.Repo.Repository.LoadAttributes(ctx); err != nil {
		ctx.Error(http.StatusInternalServerError, "LoadAttributes", err)
		return
	}

	var doerID int64
	if ctx.Doer != nil {
		doerID = ctx.Doer.ID
	}
	reviewers, err := repo_model.GetReviewers(ctx, ctx.Repo.Repository, doerID, 0)
	if err != nil {
		ctx.Error(http.StatusInternalServerError, "GetReviewers", err)
		return
	}

	protectedBranches, err := git_model.FindRepoProtectedBranchRules(ctx, ctx.Repo.Repository.ID)
	if err != nil {
		ctx.Error(http.StatusInternalServerError, "FindRepoProtectedBranchRules", err)
		return
	}
	apiProtections := make([]any, len(protectedBranches))
	for i := range protectedBranches {
		apiProtections[i] = convert.ToBranchProtection(ctx, protectedBranches[i], ctx.Repo.Repository)
	}

	targetBranch := ctx.FormString("target_branch")
	protectedBranchRule := protectedBranches.GetFirstMatched(targetBranch)
	canMerge := ctx.Doer != nil && ctx.Repo.CanWrite(unit_model.TypeCode)
	if protectedBranchRule != nil {
		canMerge = git_model.IsUserMergeWhitelisted(ctx, protectedBranchRule, doerID, ctx.Repo.Permission)
	}

	pullConfig := datahubPullRequestsConfig(ctx, ctx.Repo.Repository)
	repoLink := ctx.Repo.Repository.Link()
	ctx.JSON(http.StatusOK, map[string]any{
		"repository": map[string]any{
			"name":                          ctx.Repo.Repository.Name,
			"is_data_repo":                  ctx.Repo.Repository.IsDataRepo,
			"default_branch":                ctx.Repo.Repository.DefaultBranch,
			"permissions":                   datahubGovernancePermissions(ctx),
			"allow_merge_commits":           pullConfig.AllowMerge,
			"allow_squash_merge":            pullConfig.AllowSquash,
			"allow_rebase":                  pullConfig.AllowRebase,
			"allow_rebase_explicit":         pullConfig.AllowRebaseMerge,
			"allow_fast_forward_only_merge": pullConfig.AllowFastForwardOnly,
			"default_merge_style":           pullConfig.GetDefaultMergeStyle(),
		},
		"reviewers":          datahubGovernanceReviewers(reviewers),
		"branch_protections": apiProtections,
		"current_user":       datahubGovernanceCurrentUser(ctx, canMerge, targetBranch),
		"links": map[string]string{
			"settings":        repoLink + "/settings",
			"collaboration":   repoLink + "/settings/collaboration",
			"branches":        repoLink + "/settings/branches",
			"new_branch_rule": repoLink + "/settings/branches/edit",
		},
	})
}

func datahubGovernanceCurrentUser(ctx *context.APIContext, canMerge bool, targetBranch string) map[string]any {
	currentUser := map[string]any{
		"is_authenticated": ctx.Doer != nil,
		"can_merge":        canMerge,
		"target_branch":    targetBranch,
	}
	if ctx.Doer == nil {
		return currentUser
	}

	currentUser["login"] = ctx.Doer.Name
	currentUser["username"] = ctx.Doer.Name
	currentUser["name"] = ctx.Doer.Name
	currentUser["full_name"] = ctx.Doer.FullName
	currentUser["avatar_url"] = ctx.Doer.AvatarLink(ctx)
	currentUser["html_url"] = ctx.Doer.HomeLink()
	return currentUser
}

func datahubPullRequestsConfig(ctx *context.APIContext, repo *repo_model.Repository) *repo_model.PullRequestsConfig {
	unit, err := repo.GetUnit(ctx, unit_model.TypePullRequests)
	if err != nil {
		return &repo_model.PullRequestsConfig{}
	}
	return unit.PullRequestsConfig()
}

func datahubGovernancePermissions(ctx *context.APIContext) map[string]bool {
	return map[string]bool{
		"pull":  ctx.Repo.CanRead(unit_model.TypeCode),
		"push":  ctx.Repo.CanWrite(unit_model.TypeCode),
		"admin": ctx.Repo.IsAdmin(),
	}
}

func datahubGovernanceReviewers(reviewers []*user_model.User) []map[string]string {
	apiReviewers := make([]map[string]string, 0, len(reviewers))
	for _, reviewer := range reviewers {
		if reviewer == nil {
			continue
		}
		apiReviewers = append(apiReviewers, map[string]string{
			"login":     reviewer.Name,
			"username":  reviewer.Name,
			"full_name": reviewer.FullName,
		})
	}
	return apiReviewers
}

func DatahubGetManifest(ctx *context.APIContext) {
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().GetManifest(
			ctx,
			ctx.Repo.Repository.Name,
			ctx.Params(":commit"),
			ctx.Params("*"),
			ctx.FormString("offset"),
			ctx.FormString("limit"),
		)
	})
}

func DatahubExportFile(ctx *context.APIContext) {
	format := ctx.FormString("format")
	if format == "" {
		format = "jsonl"
	}
	contentType := "application/x-ndjson"
	if format == "csv" {
		contentType = "text/csv"
	}
	proxyToDatahubWithContentType(ctx, contentType, func() ([]byte, int, error) {
		return datahub.DefaultClient().ExportFileWithFallback(
			ctx,
			ctx.Repo.Repository.Name,
			ctx.Params(":commit"),
			ctx.Params("*"),
			format,
		)
	})
}

func DatahubMetaCompute(ctx *context.APIContext) {
	if !ctx.IsSigned {
		ctx.Error(http.StatusUnauthorized, "DatahubMetaCompute", "Sign in to refresh dataset metadata.")
		return
	}
	if !ctx.Repo.CanWrite(unit_model.TypeCode) && !ctx.IsUserRepoAdmin() && !ctx.IsUserSiteAdmin() {
		ctx.Error(http.StatusForbidden, "DatahubMetaCompute", "You do not have permission to refresh dataset metadata.")
		return
	}

	body, ok := readBody(ctx)
	if !ok {
		return
	}
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().MetaCompute(ctx, ctx.Repo.Repository.Name, body)
	})
}

func DatahubMetaGet(ctx *context.APIContext) {
	filePath := ctx.Params("*")
	if len(filePath) > len("/summary") && filePath[len(filePath)-len("/summary"):] == "/summary" {
		filePath = filePath[:len(filePath)-len("/summary")]
		proxyToDatahub(ctx, func() ([]byte, int, error) {
			return datahub.DefaultClient().MetaSummary(
				ctx,
				ctx.Repo.Repository.Name,
				ctx.Params(":commit"),
				filePath,
			)
		})
		return
	}
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().MetaGet(
			ctx,
			ctx.Repo.Repository.Name,
			ctx.Params(":commit"),
			filePath,
		)
	})
}

func DatahubMetaDiff(ctx *context.APIContext) {
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().MetaDiff(
			ctx,
			ctx.Repo.Repository.Name,
			ctx.Params(":old"),
			ctx.Params(":new"),
			ctx.FormString("file"),
		)
	})
}

func DatahubGetStats(ctx *context.APIContext) {
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		commit, err := datahubCommitForCore(ctx, datahubParam(ctx, ":commit", "*"))
		if err != nil {
			return nil, 0, err
		}
		return datahub.DefaultClient().GetStats(
			ctx,
			ctx.Repo.Repository.Name,
			commit,
			ctx.FormString("path"),
			ctx.FormString("include_size"),
		)
	})
}

func DatahubSearch(ctx *context.APIContext) {
	body, ok := readBody(ctx)
	if !ok {
		return
	}
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().Search(ctx, ctx.Repo.Repository.Name, body)
	})
}

func DatahubValidate(ctx *context.APIContext) {
	body, ok := readBody(ctx)
	if !ok {
		return
	}
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().Validate(ctx, ctx.Repo.Repository.Name, body)
	})
}

func DatahubReportCheck(ctx *context.APIContext) {
	body, ok := readBody(ctx)
	if !ok {
		return
	}
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().ReportCheck(ctx, ctx.Repo.Repository.Name, body)
	})
}

func DatahubGetChecks(ctx *context.APIContext) {
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().GetChecks(ctx, ctx.Repo.Repository.Name, ctx.Params(":commit"))
	})
}

func DatahubGetBlame(ctx *context.APIContext) {
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().GetBlame(
			ctx,
			ctx.Repo.Repository.Name,
			ctx.Params(":commit"),
			ctx.Params("*"),
			ctx.FormString("row"),
		)
	})
}

func DatahubRunGC(ctx *context.APIContext) {
	body, ok := readBody(ctx)
	if !ok {
		return
	}
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().RunGC(ctx, ctx.Repo.Repository.Name, body)
	})
}

func DatahubGetDedup(ctx *context.APIContext) {
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		commit, err := datahubCommitForCore(ctx, datahubParam(ctx, ":commit", "*"))
		if err != nil {
			return nil, 0, err
		}
		return datahub.DefaultClient().GetDedup(
			ctx,
			ctx.Repo.Repository.Name,
			commit,
			ctx.FormString("path"),
		)
	})
}

func datahubParam(ctx *context.APIContext, names ...string) string {
	for _, name := range names {
		value := strings.TrimSpace(ctx.Params(name))
		if value != "" {
			return value
		}
	}
	return ""
}

func datahubRefForCore(ctx *context.APIContext, values ...string) string {
	for _, ref := range values {
		ref = strings.TrimSpace(ref)
		if ref != "" {
			return datahubNormalizeBranchRef(ref)
		}
	}
	return datahubNormalizeBranchRef(ctx.Repo.Repository.DefaultBranch)
}

func datahubNormalizeBranchRef(ref string) string {
	ref = strings.TrimSpace(ref)
	ref = strings.TrimPrefix(ref, "refs/heads/")
	if strings.HasPrefix(ref, "heads/") {
		return ref
	}
	return "heads/" + ref
}

func datahubCommitForCore(ctx *context.APIContext, refOrCommit string) (string, error) {
	refOrCommit = strings.TrimSpace(refOrCommit)
	if datahubIsCommitHash(refOrCommit) {
		return refOrCommit, nil
	}

	ref := datahubNormalizeBranchRef(refOrCommit)
	data, status, err := datahub.DefaultClient().GetRef(ctx, ctx.Repo.Repository.Name, "heads", strings.TrimPrefix(ref, "heads/"))
	if err != nil {
		return "", err
	}
	if status < http.StatusOK || status >= http.StatusMultipleChoices {
		return "", &datahubCoreStatusError{status: status, body: data}
	}

	var payload struct {
		TargetHash string `json:"target_hash"`
		Hash       string `json:"hash"`
		CommitHash string `json:"commit_hash"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return "", err
	}
	for _, hash := range []string{payload.TargetHash, payload.Hash, payload.CommitHash} {
		if hash != "" {
			return hash, nil
		}
	}
	return "", &datahubCoreStatusError{status: http.StatusNotFound, body: []byte(`{"detail":"ref has no target hash"}`)}
}

func datahubIsCommitHash(value string) bool {
	if len(value) != 64 {
		return false
	}
	for _, r := range value {
		if (r < '0' || r > '9') && (r < 'a' || r > 'f') {
			return false
		}
	}
	return true
}

type datahubCoreStatusError struct {
	status int
	body   []byte
}

func (e *datahubCoreStatusError) Error() string {
	return "datahub core returned status " + http.StatusText(e.status) + ": " + string(e.body)
}

func (e *datahubCoreStatusError) StatusCode() int {
	return e.status
}

func (e *datahubCoreStatusError) Body() []byte {
	return e.body
}

var _ interface {
	StatusCode() int
	Body() []byte
} = (*datahubCoreStatusError)(nil)
