// Copyright 2026 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: GPL-3.0-or-later

package forgejo_migrations

import (
	"forgejo.org/modules/timeutil"

	"xorm.io/xorm"
)

func init() {
	registerMigration(&Migration{
		Description: "add repository issue and pull request templates",
		Upgrade:     addIssuePRTemplate,
	})
}

type issuePRTemplate struct {
	ID          int64              `xorm:"pk autoincr"`
	RepoID      int64              `xorm:"UNIQUE(s) INDEX NOT NULL"`
	Kind        string             `xorm:"UNIQUE(s) VARCHAR(32) NOT NULL"`
	Name        string             `xorm:"UNIQUE(s) VARCHAR(100) NOT NULL"`
	About       string             `xorm:"VARCHAR(255)"`
	Content     string             `xorm:"TEXT"`
	IsDefault   bool               `xorm:"INDEX NOT NULL DEFAULT false"`
	CreatedUnix timeutil.TimeStamp `xorm:"INDEX created"`
	UpdatedUnix timeutil.TimeStamp `xorm:"INDEX updated"`
}

func (issuePRTemplate) TableName() string {
	return "issue_pr_template"
}

func addIssuePRTemplate(x *xorm.Engine) error {
	return x.Sync(new(issuePRTemplate))
}
