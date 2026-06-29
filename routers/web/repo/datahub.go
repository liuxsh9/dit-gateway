// Copyright 2026 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: MIT

package repo

import (
	"net/http"
	"net/url"

	"forgejo.org/modules/base"
	"forgejo.org/modules/setting"
	"forgejo.org/modules/util"
	"forgejo.org/services/context"
)

const (
	tplDataHubCommits base.TplName = "repo/datahub/commits"
	tplDataHubCommit  base.TplName = "repo/datahub/commit"
	tplDataHubPreview base.TplName = "repo/datahub/preview"
	tplDataHubPulls   base.TplName = "repo/datahub/pulls"
	tplDataHubPullNew base.TplName = "repo/datahub/pull_new"
	tplDataHubPull    base.TplName = "repo/datahub/pull"
	tplDataHubSimple  base.TplName = "repo/datahub/simple"
)

func requireDataHubRepo(ctx *context.Context) bool {
	if !setting.DataHub.Enabled || !ctx.Repo.Repository.IsDataRepo {
		ctx.NotFound("DataHub repository not found", nil)
		return false
	}
	ctx.Data["PageIsViewCode"] = true
	ctx.Data["PageIsDataHub"] = true
	return true
}

func DataHubCommits(ctx *context.Context) {
	if !requireDataHubRepo(ctx) {
		return
	}

	ctx.Data["PageIsCommits"] = true
	ctx.Data["DataHubBranch"] = ctx.Params("*")
	ctx.HTML(http.StatusOK, tplDataHubCommits)
}

func DataHubCommitsDefault(ctx *context.Context) {
	if !requireDataHubRepo(ctx) {
		return
	}

	ctx.Redirect(ctx.Repo.RepoLink+"/data/commits/"+util.PathEscapeSegments(ctx.Repo.Repository.DefaultBranch), http.StatusSeeOther)
}

func DataHubCommit(ctx *context.Context) {
	if !requireDataHubRepo(ctx) {
		return
	}

	ctx.Data["PageIsCommits"] = true
	ctx.Data["DataHubCommit"] = ctx.Params("hash")
	ctx.HTML(http.StatusOK, tplDataHubCommit)
}

func DataHubPreview(ctx *context.Context) {
	if !requireDataHubRepo(ctx) {
		return
	}

	ref := ctx.Params("commit")
	if ref == "" {
		ref = ctx.Params("ref")
	}
	ctx.Data["DataHubCommit"] = ref
	ctx.Data["DataHubPath"] = ctx.Params("*")
	ctx.HTML(http.StatusOK, tplDataHubPreview)
}

func DataHubPulls(ctx *context.Context) {
	if !requireDataHubRepo(ctx) {
		return
	}

	ctx.Data["PageIsViewCode"] = false
	ctx.Data["PageIsPullList"] = true
	ctx.HTML(http.StatusOK, tplDataHubPulls)
}

func DataHubPullNew(ctx *context.Context) {
	if !requireDataHubRepo(ctx) {
		return
	}

	ctx.Data["PageIsViewCode"] = false
	ctx.Data["PageIsPullList"] = true
	ctx.HTML(http.StatusOK, tplDataHubPullNew)
}

func DataHubPull(ctx *context.Context) {
	if !requireDataHubRepo(ctx) {
		return
	}

	ctx.Data["PageIsViewCode"] = false
	ctx.Data["PageIsPullList"] = true
	ctx.Data["DataHubPullID"] = ctx.Params("id")
	ctx.HTML(http.StatusOK, tplDataHubPull)
}

func DataHubPullLegacyRedirect(ctx *context.Context, suffix string) bool {
	if !setting.DataHub.Enabled || !ctx.Repo.Repository.IsDataRepo {
		return false
	}

	redirectTo := ctx.Repo.RepoLink + "/data/pulls" + suffix
	if ctx.Req.URL.RawQuery != "" {
		redirectTo += "?" + ctx.Req.URL.RawQuery
	}
	ctx.Redirect(redirectTo, http.StatusSeeOther)
	return true
}

func DataHubPullListLegacyRedirect(ctx *context.Context) {
	if typ := ctx.Params(":type"); typ == "" || typ == "pulls" {
		DataHubPullLegacyRedirect(ctx, "")
	}
}

func DataHubPullItemLegacyRedirect(ctx *context.Context) {
	if typ := ctx.Params(":type"); typ == "" || typ == "pulls" {
		dataHubPullItemLegacyRedirect(ctx)
	}
}

func dataHubPullItemLegacyRedirect(ctx *context.Context) bool {
	if id := url.PathEscape(ctx.Params(":index")); id != "" {
		return DataHubPullLegacyRedirect(ctx, "/"+id)
	}
	return false
}

func DataHubSecurity(ctx *context.Context) {
	if !requireDataHubRepo(ctx) {
		return
	}

	ctx.Data["PageIsViewCode"] = false
	ctx.Data["PageIsDataHubSecurity"] = true
	ctx.Data["DataHubSimpleTitle"] = "Security and quality"
	ctx.Data["DataHubSimpleEyebrow"] = "DIT dataset"
	ctx.Data["DataHubSimpleBody"] = "Security, privacy, and data-quality reports will appear here as DIT checks are configured."
	ctx.HTML(http.StatusOK, tplDataHubSimple)
}

func DataHubInsights(ctx *context.Context) {
	if !requireDataHubRepo(ctx) {
		return
	}

	ctx.Data["PageIsViewCode"] = false
	ctx.Data["PageIsDataHubInsights"] = true
	ctx.Data["DataHubSimpleTitle"] = "Insights"
	ctx.Data["DataHubSimpleEyebrow"] = "DIT dataset"
	ctx.Data["DataHubSimpleBody"] = "Dataset statistics and trend dashboards will live here. The current summary metrics remain available on the Data page during phase one."
	ctx.HTML(http.StatusOK, tplDataHubSimple)
}
