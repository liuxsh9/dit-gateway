// Copyright 2024-2025 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: GPL-3.0-or-later

package integration

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"forgejo.org/models/unittest"
	"forgejo.org/modules/translation"

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
	page.AssertElement(t, "nav#navbar .navbar-left a[href='https://forgejo.org/docs/latest/']", true)
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
