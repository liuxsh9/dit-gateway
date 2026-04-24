// Copyright 2024 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: MIT

package setting

// DataHub holds configuration for the [datahub] section of app.ini.
var DataHub = struct {
	Enabled      bool   `ini:"ENABLED"`
	CoreURL      string `ini:"CORE_URL"`
	ServiceToken string `ini:"SERVICE_TOKEN"`
}{
	Enabled:      false,
	CoreURL:      "http://localhost:8000",
	ServiceToken: "",
}

func loadDatahubFrom(rootCfg ConfigProvider) {
	mustMapSetting(rootCfg, "datahub", &DataHub)
}
