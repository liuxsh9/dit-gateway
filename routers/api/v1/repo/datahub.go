// Copyright 2024 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: MIT

package repo

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	git_model "forgejo.org/models/git"
	repo_model "forgejo.org/models/repo"
	unit_model "forgejo.org/models/unit"
	"forgejo.org/modules/datahub"
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
		ctx.Error(http.StatusBadGateway, "datahub proxy", err)
		return
	}
	ctx.Resp.Header().Set("Content-Type", contentType)
	ctx.Resp.WriteHeader(status)
	_, _ = ctx.Resp.Write(data)
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
		return datahub.DefaultClient().GetRef(ctx, ctx.Repo.Repository.Name, ctx.Params(":ref_type"), ctx.Params(":name"))
	})
}

func DatahubUpdateRef(ctx *context.APIContext) {
	body, ok := readBody(ctx)
	if !ok {
		return
	}
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().UpdateRef(ctx, ctx.Repo.Repository.Name, ctx.Params(":ref_type"), ctx.Params(":name"), body)
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
		return datahub.DefaultClient().GetTree(ctx, ctx.Repo.Repository.Name, ctx.Params(":hash"), ctx.Params("*"))
	})
}

func DatahubGetDiff(ctx *context.APIContext) {
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().GetDiff(ctx, ctx.Repo.Repository.Name, ctx.Params(":old"), ctx.Params(":new"))
	})
}

func DatahubGetLog(ctx *context.APIContext) {
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		ref := ctx.FormString("ref")
		if ref == "" {
			ref = ctx.Params(":ref")
		}
		return datahub.DefaultClient().GetLog(ctx, ctx.Repo.Repository.Name, ref, ctx.FormString("limit"))
	})
}

func DatahubListPulls(ctx *context.APIContext) {
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().ListPulls(ctx, ctx.Repo.Repository.Name, ctx.FormString("status"))
	})
}

func DatahubCreatePull(ctx *context.APIContext) {
	body, ok := readBody(ctx)
	if !ok {
		return
	}
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().CreatePull(ctx, ctx.Repo.Repository.Name, body)
	})
}

func DatahubGetPull(ctx *context.APIContext) {
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().GetPull(ctx, ctx.Repo.Repository.Name, ctx.Params(":id"))
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
	if ctx.Doer == nil || !ctx.Repo.Permission.CanWrite(unit_model.TypeCode) {
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
		return datahub.DefaultClient().ListPullComments(ctx, ctx.Repo.Repository.Name, ctx.Params(":id"))
	})
}

func DatahubCreatePullComment(ctx *context.APIContext) {
	body, ok := readBody(ctx)
	if !ok {
		return
	}
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().CreatePullComment(ctx, ctx.Repo.Repository.Name, ctx.Params(":id"), body)
	})
}

func DatahubListPullReviews(ctx *context.APIContext) {
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().ListPullReviews(ctx, ctx.Repo.Repository.Name, ctx.Params(":id"))
	})
}

func DatahubCreatePullReview(ctx *context.APIContext) {
	body, ok := readBody(ctx)
	if !ok {
		return
	}
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().CreatePullReview(ctx, ctx.Repo.Repository.Name, ctx.Params(":id"), body)
	})
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
	canMerge := ctx.Doer != nil && ctx.Repo.Permission.CanWrite(unit_model.TypeCode)
	if protectedBranchRule != nil {
		canMerge = git_model.IsUserMergeWhitelisted(ctx, protectedBranchRule, doerID, ctx.Repo.Permission)
	}

	repoLink := ctx.Repo.Repository.Link()
	ctx.JSON(http.StatusOK, map[string]any{
		"repository":         convert.ToRepo(ctx, ctx.Repo.Repository, ctx.Repo.Permission),
		"reviewers":          convert.ToUsers(ctx, ctx.Doer, reviewers),
		"branch_protections": apiProtections,
		"current_user": map[string]any{
			"is_authenticated": ctx.Doer != nil,
			"can_merge":        canMerge,
			"target_branch":    targetBranch,
		},
		"links": map[string]string{
			"settings":        repoLink + "/settings",
			"collaboration":   repoLink + "/settings/collaboration",
			"branches":        repoLink + "/settings/branches",
			"new_branch_rule": repoLink + "/settings/branches/edit",
		},
	})
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
		return datahub.DefaultClient().GetStats(
			ctx,
			ctx.Repo.Repository.Name,
			ctx.Params(":commit"),
			ctx.FormString("path"),
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
		return datahub.DefaultClient().GetDedup(
			ctx,
			ctx.Repo.Repository.Name,
			ctx.Params(":commit"),
			ctx.FormString("path"),
		)
	})
}
