// Copyright 2024-2025 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: GPL-3.0-or-later

package integration

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"forgejo.org/models/db"
	"forgejo.org/models/unittest"
	user_model "forgejo.org/models/user"
	"forgejo.org/modules/translation"
	repo_service "forgejo.org/services/repository"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// This test verifies common elements that are visible on all pages but most
// likely to be first seen on `/`
func TestCommonNavigationElements(t *testing.T) {
	require.NoError(t, unittest.PrepareTestDatabase())

	session := loginUser(t, "user1")
	locale := translation.NewLocale("en-US")

	response := session.MakeRequest(t, NewRequest(t, "GET", "/"), http.StatusOK)
	page := NewHTMLParser(t, response.Body)

	// After footer: index.js
	page.AssertElement(t, "script[src^='/assets/js/index.js']", true)
	onerror, _ := page.Find("script[src^='/assets/js/index.js']").Attr("onerror")
	expected := fmt.Sprintf("alert('%s'.replace('{path}', this.src))", locale.TrString("alert.asset_load_failed"))
	assert.Equal(t, expected, onerror)
}

func TestSignedInGlobalNavigationUsesAppLevelDestinations(t *testing.T) {
	require.NoError(t, unittest.PrepareTestDatabase())

	session := loginUser(t, "user2")
	response := session.MakeRequest(t, NewRequest(t, "GET", "/user2/repo1"), http.StatusOK)
	page := NewHTMLParser(t, response.Body)
	navbarText := strings.Join(strings.Fields(page.Find("nav#navbar .navbar-left").Text()), " ")

	assert.Contains(t, navbarText, "Repositories")
	assert.Contains(t, navbarText, "Users")
	assert.Contains(t, navbarText, "Organizations")
	assert.Contains(t, navbarText, "Help")
	assert.NotContains(t, navbarText, "Issues")
	assert.NotContains(t, navbarText, "Pull requests")
	assert.NotContains(t, navbarText, "Milestones")
	assert.NotContains(t, navbarText, "Explore")
	page.AssertElement(t, "nav#navbar .navbar-left a[href='/explore/repos']", true)
	page.AssertElement(t, "nav#navbar .navbar-left a[href='/explore/users']", true)
	page.AssertElement(t, "nav#navbar .navbar-left a[href='/explore/organizations']", true)
	page.AssertElement(t, "nav#navbar .navbar-left a[href='/-/help']", true)
	page.AssertElement(t, "nav#navbar .navbar-left a[href='/admin']", false)
}

func TestAnonymousGlobalNavigationUsesPublicAppLevelDestinations(t *testing.T) {
	require.NoError(t, unittest.PrepareTestDatabase())

	response := MakeRequest(t, NewRequest(t, "GET", "/explore/repos"), http.StatusOK)
	page := NewHTMLParser(t, response.Body)
	navbarText := strings.Join(strings.Fields(page.Find("nav#navbar .navbar-left").Text()), " ")

	assert.Contains(t, navbarText, "Repositories")
	assert.Contains(t, navbarText, "Users")
	assert.Contains(t, navbarText, "Organizations")
	assert.Contains(t, navbarText, "Help")
	assert.NotContains(t, navbarText, "Explore")
	page.AssertElement(t, "nav#navbar .navbar-left a[href='/explore/repos']", true)
	page.AssertElement(t, "nav#navbar .navbar-left a[href='/explore/users']", true)
	page.AssertElement(t, "nav#navbar .navbar-left a[href='/explore/organizations']", true)
	page.AssertElement(t, "nav#navbar .navbar-left a[href='/-/help']", true)
}

func TestSignedInGlobalNavigationShowsSettingsForAdmins(t *testing.T) {
	require.NoError(t, unittest.PrepareTestDatabase())

	session := loginUser(t, "user1")
	response := session.MakeRequest(t, NewRequest(t, "GET", "/"), http.StatusOK)
	page := NewHTMLParser(t, response.Body)
	navbarText := strings.Join(strings.Fields(page.Find("nav#navbar .navbar-left").Text()), " ")

	assert.Contains(t, navbarText, "Settings")
	page.AssertElement(t, "nav#navbar .navbar-left a[href='/admin']", true)
}

func TestDitHelpPage(t *testing.T) {
	require.NoError(t, unittest.PrepareTestDatabase())

	response := MakeRequest(t, NewRequest(t, "GET", "/-/help"), http.StatusOK)
	page := NewHTMLParser(t, response.Body)

	assert.Contains(t, page.Find("main").Text(), "Get started with dit and dit-gateway")
	assert.Contains(t, page.Find("main").Text(), "快速开始使用 dit 与 dit-gateway")
	assert.Contains(t, page.Find("main").Text(), "dit clone")
	assert.Contains(t, page.Find("main").Text(), "dit auth set-token")
}

func TestEmptyRepositoryCloneHelpUsesDitHelp(t *testing.T) {
	require.NoError(t, unittest.PrepareTestDatabase())

	owner := unittest.AssertExistsAndLoadBean(t, &user_model.User{Name: "user5"})
	repository, err := repo_service.CreateRepository(db.DefaultContext, owner, owner, repo_service.CreateRepoOptions{
		Name:     "empty-help-repo",
		AutoInit: false,
	})
	require.NoError(t, err)
	t.Cleanup(func() {
		require.NoError(t, repo_service.DeleteRepository(db.DefaultContext, owner, repository, false))
	})

	session := loginUser(t, owner.Name)
	response := session.MakeRequest(t, NewRequest(t, "GET", repository.HTMLURL()), http.StatusOK)
	page := NewHTMLParser(t, response.Body)

	page.AssertElement(t, ".empty-repo-guide a[href='/-/help']", true)
	page.AssertElement(t, ".empty-repo-guide a[href='http://git-scm.com/book/en/v2/Git-Basics-Getting-a-Git-Repository']", false)
}
