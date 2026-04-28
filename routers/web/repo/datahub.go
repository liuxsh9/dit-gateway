// Copyright 2026 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: MIT

package repo

import (
	"net/http"

	"forgejo.org/modules/base"
	"forgejo.org/modules/setting"
	"forgejo.org/services/context"
)

const (
	tplDataHubCommits base.TplName = "repo/datahub/commits"
	tplDataHubCommit  base.TplName = "repo/datahub/commit"
	tplDataHubPreview base.TplName = "repo/datahub/preview"
)

func requireDataHubRepo(ctx *context.Context) bool {
	if !setting.DataHub.Enabled || !ctx.Repo.Repository.IsDataRepo {
		ctx.NotFound("DataHub repository not found", nil)
		return false
	}
	ctx.Data["PageIsViewCode"] = true
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

	ctx.Data["DataHubCommit"] = ctx.Params("commit")
	ctx.Data["DataHubPath"] = ctx.Params("*")
	ctx.HTML(http.StatusOK, tplDataHubPreview)
}
