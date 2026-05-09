// Copyright 2026 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: MIT

package repo_test

import (
	"testing"

	repo_model "forgejo.org/models/repo"
	"forgejo.org/models/unittest"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIssuePRTemplateDefaultsAndKindUpdate(t *testing.T) {
	require.NoError(t, unittest.PrepareTestDatabase())

	first := &repo_model.IssuePRTemplate{
		RepoID:    1,
		Kind:      repo_model.TemplateKindPullRequest,
		Name:      "First PR",
		Content:   "first",
		IsDefault: true,
	}
	require.NoError(t, repo_model.UpsertIssuePRTemplate(t.Context(), first))

	second := &repo_model.IssuePRTemplate{
		RepoID:    1,
		Kind:      repo_model.TemplateKindPullRequest,
		Name:      "Second PR",
		Content:   "second",
		IsDefault: true,
	}
	require.NoError(t, repo_model.UpsertIssuePRTemplate(t.Context(), second))
	require.NotZero(t, second.ID)
	savedSecond := unittest.AssertExistsAndLoadBean(t, &repo_model.IssuePRTemplate{
		RepoID: 1,
		Kind:   repo_model.TemplateKindPullRequest,
		Name:   "Second PR",
	})
	savedFirst := unittest.AssertExistsAndLoadBean(t, &repo_model.IssuePRTemplate{
		RepoID: 1,
		Kind:   repo_model.TemplateKindPullRequest,
		Name:   "First PR",
	})
	assert.False(t, savedFirst.IsDefault)

	defaultTemplate, has, err := repo_model.GetDefaultIssuePRTemplate(t.Context(), 1, repo_model.TemplateKindPullRequest)
	require.NoError(t, err)
	require.True(t, has)
	assert.Equal(t, savedSecond.ID, defaultTemplate.ID)

	first.Kind = repo_model.TemplateKindIssue
	first.Name = "First issue"
	first.IsDefault = true
	require.NoError(t, repo_model.UpsertIssuePRTemplate(t.Context(), first))

	updated, has, err := repo_model.GetIssuePRTemplateByID(t.Context(), 1, first.ID)
	require.NoError(t, err)
	require.True(t, has)
	assert.Equal(t, repo_model.TemplateKindIssue, updated.Kind)
	assert.Equal(t, "First issue", updated.Name)
}
