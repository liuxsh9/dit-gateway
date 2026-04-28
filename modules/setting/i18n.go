// Copyright 2021 The Gitea Authors. All rights reserved.
// SPDX-License-Identifier: MIT

package setting

// defaultI18nLangNames must be a slice, we need the order
var defaultI18nLangNames = []string{
	"en-US", "English",
}

func defaultI18nLangs() (res []string) {
	for i := 0; i < len(defaultI18nLangNames); i += 2 {
		res = append(res, defaultI18nLangNames[i])
	}
	return res
}

func defaultI18nNames() (res []string) {
	for i := 0; i < len(defaultI18nLangNames); i += 2 {
		res = append(res, defaultI18nLangNames[i+1])
	}
	return res
}

var (
	// I18n settings
	Langs []string
	Names []string
)

func loadI18nFrom(rootCfg ConfigProvider) {
	Langs = rootCfg.Section("i18n").Key("LANGS").Strings(",")
	if len(Langs) == 0 {
		Langs = defaultI18nLangs()
	}
	Names = rootCfg.Section("i18n").Key("NAMES").Strings(",")
	if len(Names) == 0 {
		Names = defaultI18nNames()
	}
}
