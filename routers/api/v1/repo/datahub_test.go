// Copyright 2026 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: MIT

package repo

import (
	"context"
	"errors"
	"fmt"
	"testing"

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
