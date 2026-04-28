// Copyright 2026 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: MIT

package setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoadI18nDefaultsToEnglishOnly(t *testing.T) {
	cfg, err := NewConfigProviderFromData("")
	require.NoError(t, err)

	loadI18nFrom(cfg)

	assert.Equal(t, []string{"en-US"}, Langs)
	assert.Equal(t, []string{"English"}, Names)
}

func TestLoadI18nAllowsExplicitLanguages(t *testing.T) {
	cfg, err := NewConfigProviderFromData(`
[i18n]
LANGS = en-US,fr-FR
NAMES = English,French
`)
	require.NoError(t, err)

	loadI18nFrom(cfg)

	assert.Equal(t, []string{"en-US", "fr-FR"}, Langs)
	assert.Equal(t, []string{"English", "French"}, Names)
}
