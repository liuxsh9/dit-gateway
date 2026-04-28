// Copyright 2024 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: MIT

package repo

import (
	"io"
	"net/http"

	"forgejo.org/modules/datahub"
	"forgejo.org/modules/setting"
	"forgejo.org/services/context"
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
	body, ok := readBody(ctx)
	if !ok {
		return
	}
	proxyToDatahub(ctx, func() ([]byte, int, error) {
		return datahub.DefaultClient().MergePull(ctx, ctx.Repo.Repository.Name, ctx.Params(":id"), body)
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
