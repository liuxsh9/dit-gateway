// Copyright 2026 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: GPL-3.0-or-later

package forgejo_migrations

import (
	"xorm.io/xorm"
)

func init() {
	registerMigration(&Migration{
		Description: "add IsDataRepo flag to repository",
		Upgrade:     addIsDataRepoToRepository,
	})
}

func addIsDataRepoToRepository(x *xorm.Engine) error {
	type Repository struct {
		ID         int64 `xorm:"pk autoincr"`
		IsDataRepo bool  `xorm:"INDEX NOT NULL DEFAULT false"`
	}
	return x.Sync(new(Repository))
}
