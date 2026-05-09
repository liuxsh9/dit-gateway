// Copyright 2026 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: MIT

package repo

import (
	"context"
	"strings"

	"forgejo.org/models/db"
	"forgejo.org/modules/timeutil"
)

type TemplateKind string

const (
	TemplateKindIssue       TemplateKind = "issue"
	TemplateKindPullRequest TemplateKind = "pull_request"
)

func init() {
	db.RegisterModel(new(IssuePRTemplate))
}

// IssuePRTemplate stores repository-managed issue and pull request templates.
type IssuePRTemplate struct {
	ID          int64              `xorm:"pk autoincr"`
	RepoID      int64              `xorm:"UNIQUE(s) INDEX NOT NULL"`
	Kind        TemplateKind       `xorm:"UNIQUE(s) VARCHAR(32) NOT NULL"`
	Name        string             `xorm:"UNIQUE(s) VARCHAR(100) NOT NULL"`
	About       string             `xorm:"VARCHAR(255)"`
	Content     string             `xorm:"TEXT"`
	IsDefault   bool               `xorm:"INDEX NOT NULL DEFAULT false"`
	CreatedUnix timeutil.TimeStamp `xorm:"INDEX created"`
	UpdatedUnix timeutil.TimeStamp `xorm:"INDEX updated"`
}

func (IssuePRTemplate) TableName() string {
	return "issue_pr_template"
}

func (t *IssuePRTemplate) DisplayName() string {
	if strings.TrimSpace(t.Name) != "" {
		return t.Name
	}
	if t.Kind == TemplateKindPullRequest {
		return "Pull request template"
	}
	return "Issue template"
}

func ListIssuePRTemplates(ctx context.Context, repoID int64, kind TemplateKind) ([]*IssuePRTemplate, error) {
	templates := make([]*IssuePRTemplate, 0)
	sess := db.GetEngine(ctx).Where("repo_id = ?", repoID).OrderBy("kind ASC, is_default DESC, name ASC")
	if kind != "" {
		sess = sess.And("kind = ?", kind)
	}
	return templates, sess.Find(&templates)
}

func GetIssuePRTemplateByID(ctx context.Context, repoID, id int64) (*IssuePRTemplate, bool, error) {
	tmpl := &IssuePRTemplate{ID: id, RepoID: repoID}
	has, err := db.GetEngine(ctx).Get(tmpl)
	return tmpl, has, err
}

func GetDefaultIssuePRTemplate(ctx context.Context, repoID int64, kind TemplateKind) (*IssuePRTemplate, bool, error) {
	tmpl := &IssuePRTemplate{}
	has, err := db.GetEngine(ctx).
		Where("repo_id = ? AND kind = ? AND is_default = ?", repoID, kind, true).
		OrderBy("name ASC").
		Get(tmpl)
	if err != nil || has {
		return tmpl, has, err
	}
	templates, err := ListIssuePRTemplates(ctx, repoID, kind)
	if err != nil || len(templates) == 0 {
		return nil, false, err
	}
	return templates[0], true, nil
}

func UpsertIssuePRTemplate(ctx context.Context, tmpl *IssuePRTemplate) error {
	return db.WithTx(ctx, func(ctx context.Context) error {
		if tmpl.ID == 0 {
			if err := db.Insert(ctx, tmpl); err != nil {
				return err
			}
			saved := &IssuePRTemplate{
				RepoID: tmpl.RepoID,
				Kind:   tmpl.Kind,
				Name:   tmpl.Name,
			}
			if has, err := db.GetEngine(ctx).Get(saved); err != nil {
				return err
			} else if has {
				tmpl.ID = saved.ID
			}
		} else if _, err := db.GetEngine(ctx).ID(tmpl.ID).Cols("kind", "name", "about", "content", "is_default").Update(tmpl); err != nil {
			return err
		}

		if tmpl.IsDefault && tmpl.ID != 0 {
			_, err := db.GetEngine(ctx).
				Table(new(IssuePRTemplate)).
				Where("repo_id = ? AND kind = ? AND id <> ?", tmpl.RepoID, tmpl.Kind, tmpl.ID).
				Update(map[string]any{"is_default": false})
			return err
		}
		return nil
	})
}

func DeleteIssuePRTemplate(ctx context.Context, repoID, id int64) error {
	_, err := db.GetEngine(ctx).Delete(&IssuePRTemplate{ID: id, RepoID: repoID})
	return err
}
