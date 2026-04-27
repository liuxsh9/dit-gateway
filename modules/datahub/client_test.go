package datahub_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"forgejo.org/modules/datahub"
	"forgejo.org/modules/setting"
)

func newTestClient(t *testing.T, handler http.Handler) *datahub.Client {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	setting.DataHub.CoreURL = srv.URL
	setting.DataHub.ServiceToken = "test-token"
	datahub.ResetDefaultClient()
	return datahub.DefaultClient()
}

func TestListRefs(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/api/v1/repos/myrepo/refs", r.URL.Path)
		assert.Equal(t, "test-token", r.Header.Get("X-Service-Token"))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`[]`))
	}))
	data, status, err := client.ListRefs(context.Background(), "myrepo")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Equal(t, []byte(`[]`), data)
}

func TestCreateRepo(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/api/v1/repos", r.URL.Path)
		w.WriteHeader(http.StatusCreated)
	}))
	err := client.CreateRepo(context.Background(), "newrepo")
	require.NoError(t, err)
}

func TestDeleteRepoNotFound(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	err := client.DeleteRepo(context.Background(), "gone-repo")
	require.NoError(t, err)
}

func TestDeleteRepoServerError(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	err := client.DeleteRepo(context.Background(), "broken-repo")
	require.Error(t, err)
}

func TestGetRef(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/api/v1/repos/myrepo/refs/heads/main", r.URL.Path)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"target_hash":"abc123"}`))
	}))
	data, status, err := client.GetRef(context.Background(), "myrepo", "heads", "main")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Contains(t, string(data), "abc123")
}

func TestUpdateRef(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/api/v1/repos/myrepo/refs/heads/main", r.URL.Path)
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))
		body, _ := io.ReadAll(r.Body)
		assert.Contains(t, string(body), "target_hash")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	data, status, err := client.UpdateRef(context.Background(), "myrepo", "heads", "main", []byte(`{"target_hash":"def456"}`))
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.NotNil(t, data)
}

func TestGetObject(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/api/v1/repos/myrepo/objects/rows/sha256hash", r.URL.Path)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"data":"chunk"}`))
	}))
	data, status, err := client.GetObject(context.Background(), "myrepo", "rows", "sha256hash")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Contains(t, string(data), "chunk")
}

func TestGetTree(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/api/v1/repos/myrepo/tree/abc123/", r.URL.Path)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"entries":[]}`))
	}))
	data, status, err := client.GetTree(context.Background(), "myrepo", "abc123")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Contains(t, string(data), "entries")
}

func TestGetDiff(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/api/v1/repos/myrepo/diff/old123/new456", r.URL.Path)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"files":[]}`))
	}))
	data, status, err := client.GetDiff(context.Background(), "myrepo", "old123", "new456")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Contains(t, string(data), "files")
}

func TestGetLogUsesCoreQueryRef(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/api/v1/repos/myrepo/log", r.URL.Path)
		assert.Equal(t, "heads/main", r.URL.Query().Get("ref"))
		assert.Equal(t, "1", r.URL.Query().Get("limit"))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"commits":[{"commit_hash":"abc123"}]}`))
	}))
	data, status, err := client.GetLog(context.Background(), "myrepo", "heads/main", "1")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Contains(t, string(data), "abc123")
}

func TestListPulls(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/api/v1/repos/myrepo/pulls", r.URL.Path)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`[]`))
	}))
	data, status, err := client.ListPulls(context.Background(), "myrepo")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Equal(t, []byte(`[]`), data)
}

func TestGetManifest(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/api/v1/repos/myrepo/manifest/commit123/train/data.jsonl", r.URL.Path)
		assert.Equal(t, "50", r.URL.Query().Get("limit"))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"entries":[{"row_hash":"a"}]}`))
	}))
	data, status, err := client.GetManifest(context.Background(), "myrepo", "commit123", "train/data.jsonl", "0", "50")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Contains(t, string(data), "entries")
}

func TestMergePull(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/api/v1/repos/myrepo/pulls/42/merge", r.URL.Path)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"merged":true}`))
	}))
	data, status, err := client.MergePull(context.Background(), "myrepo", "42", []byte(`{"resolutions":{}}`))
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Contains(t, string(data), "merged")
}

func TestMetaCompute(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/api/v1/repos/myrepo/meta/compute", r.URL.Path)
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))
		assert.Equal(t, "test-token", r.Header.Get("X-Service-Token"))
		body, _ := io.ReadAll(r.Body)
		assert.Contains(t, string(body), "train.jsonl")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"commit_hash":"abc123","sidecars":[{"file":"train.jsonl","sidecar_hash":"def456"}]}`))
	}))
	data, status, err := client.MetaCompute(context.Background(), "myrepo", []byte(`{"file":"train.jsonl"}`))
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Contains(t, string(data), "commit_hash")
}

func TestMetaGet(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/api/v1/repos/myrepo/meta/abc123/train.jsonl", r.URL.Path)
		assert.Equal(t, "test-token", r.Header.Get("X-Service-Token"))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"manifest_hash":"abc123","entries":[]}`))
	}))
	data, status, err := client.MetaGet(context.Background(), "myrepo", "abc123", "train.jsonl")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Contains(t, string(data), "manifest_hash")
}

func TestMetaSummary(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/api/v1/repos/myrepo/meta/abc123/train.jsonl/summary", r.URL.Path)
		assert.Equal(t, "test-token", r.Header.Get("X-Service-Token"))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"row_count":1500,"token_estimate":1130250,"lang_distribution":{"zh":0.82}}`))
	}))
	data, status, err := client.MetaSummary(context.Background(), "myrepo", "abc123", "train.jsonl")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Contains(t, string(data), "row_count")
}

func TestMetaDiff(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/api/v1/repos/myrepo/meta/diff/old123/new456", r.URL.Path)
		assert.Equal(t, "train.jsonl", r.URL.Query().Get("file"))
		assert.Equal(t, "test-token", r.Header.Get("X-Service-Token"))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"files":[{"path":"train.jsonl","delta":{"row_count":120}}]}`))
	}))
	data, status, err := client.MetaDiff(context.Background(), "myrepo", "old123", "new456", "train.jsonl")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Contains(t, string(data), "files")
}

func TestMetaDiffNoFile(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "", r.URL.Query().Get("file"))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"files":[]}`))
	}))
	data, status, err := client.MetaDiff(context.Background(), "myrepo", "old123", "new456", "")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Contains(t, string(data), "files")
}
