// Copyright 2026 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: MIT

package repo

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"testing"

	repo_model "forgejo.org/models/repo"
	"forgejo.org/modules/setting"
	context_service "forgejo.org/services/context"
	"forgejo.org/services/contexttest"

	"github.com/stretchr/testify/assert"
)

func TestIsDatahubProxyCancel(t *testing.T) {
	canceledCtx, cancel := context.WithCancel(context.Background())
	cancel()

	tests := []struct {
		name string
		ctx  context.Context
		err  error
		want bool
	}{
		{
			name: "context canceled",
			ctx:  context.Background(),
			err:  context.Canceled,
			want: true,
		},
		{
			name: "wrapped context canceled",
			ctx:  context.Background(),
			err:  fmt.Errorf("upstream request failed: %w", context.Canceled),
			want: true,
		},
		{
			name: "request context canceled",
			ctx:  canceledCtx,
			err:  errors.New("transport closed"),
			want: true,
		},
		{
			name: "ordinary error",
			ctx:  context.Background(),
			err:  errors.New("upstream failed"),
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, isDatahubProxyCancel(tt.ctx, tt.err))
		})
	}
}

func TestNormalizeDatahubPullStatus(t *testing.T) {
	tests := []struct {
		name       string
		status     string
		wantStatus string
		wantOK     bool
	}{
		{
			name:       "empty status means unfiltered",
			status:     "",
			wantStatus: "",
			wantOK:     true,
		},
		{
			name:       "all status means unfiltered",
			status:     "all",
			wantStatus: "",
			wantOK:     true,
		},
		{
			name:       "open status passes through",
			status:     "open",
			wantStatus: "open",
			wantOK:     true,
		},
		{
			name:       "closed status passes through",
			status:     "closed",
			wantStatus: "closed",
			wantOK:     true,
		},
		{
			name:       "merged status passes through",
			status:     "merged",
			wantStatus: "merged",
			wantOK:     true,
		},
		{
			name:       "unknown status is invalid",
			status:     "bogus",
			wantStatus: "",
			wantOK:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotStatus, gotOK := normalizeDatahubPullStatus(tt.status)

			assert.Equal(t, tt.wantStatus, gotStatus)
			assert.Equal(t, tt.wantOK, gotOK)
		})
	}
}

func TestDatahubListPullsRejectsUnknownStatus(t *testing.T) {
	oldEnabled := setting.DataHub.Enabled
	setting.DataHub.Enabled = true
	t.Cleanup(func() {
		setting.DataHub.Enabled = oldEnabled
	})

	ctx, resp := contexttest.MockAPIContext(t, "GET /api/v1/repos/owner/repo/pulls?status=bogus")
	ctx.Repo = &context_service.Repository{
		Repository: &repo_model.Repository{
			Name:       "repo",
			IsDataRepo: true,
		},
	}

	DatahubListPulls(ctx)

	assert.Equal(t, http.StatusBadRequest, resp.Code)
	assert.Contains(t, resp.Body.String(), "unknown pull status: bogus")
}

func TestDatahubListPullsKeepsNotFoundWhenDatahubDisabled(t *testing.T) {
	oldEnabled := setting.DataHub.Enabled
	setting.DataHub.Enabled = false
	t.Cleanup(func() {
		setting.DataHub.Enabled = oldEnabled
	})

	ctx, resp := contexttest.MockAPIContext(t, "GET /api/v1/repos/owner/repo/pulls?status=bogus")
	ctx.Repo = &context_service.Repository{
		Repository: &repo_model.Repository{
			Name:       "repo",
			IsDataRepo: true,
		},
	}

	DatahubListPulls(ctx)

	assert.Equal(t, http.StatusNotFound, resp.Code)
}
