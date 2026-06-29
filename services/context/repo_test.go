// Copyright 2026 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: MIT

package context

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestIsDataHubAllowedRepoRoute(t *testing.T) {
	repoLink := "/user2/datarepo"

	for _, link := range []string{
		repoLink,
		repoLink + "/settings",
		repoLink + "/settings/branches",
		repoLink + "/data/pulls/1",
		repoLink + "/issues",
		repoLink + "/issues/1",
		repoLink + "/pulls",
		repoLink + "/pulls/new",
		repoLink + "/pulls/1",
		repoLink + "/comments/10",
		repoLink + "/comments/10/delete",
		repoLink + "/comments/10/reactions/react",
		repoLink + "/markup",
		repoLink + "/actions",
		repoLink + "/actions/runs/1",
		repoLink + "/action/star",
	} {
		assert.True(t, isDataHubAllowedRepoRoute(link, repoLink), "expected %q to be allowed", link)
	}

	for _, link := range []string{
		repoLink + "/src/branch/main/README.md",
		repoLink + "/commits/branch/main",
		repoLink + "/pulls/1/files",
		repoLink + "/pulls/posters",
		repoLink + "/releases",
		repoLink + "/comments",
		repoLink + "/comments-and-more/10",
	} {
		assert.False(t, isDataHubAllowedRepoRoute(link, repoLink), "expected %q to be redirected", link)
	}
}
