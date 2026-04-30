package datahub_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
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

func TestGetRefEscapesSlashBranchNamesBySegment(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/api/v1/repos/myrepo/refs/heads/feature/foo", r.URL.Path)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"target_hash":"abc123"}`))
	}))
	data, status, err := client.GetRef(context.Background(), "myrepo", "heads", "feature/foo")
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

func TestBatchExists(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/api/v1/repos/myrepo/objects/batch-exists", r.URL.Path)
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))
		assert.Equal(t, "test-token", r.Header.Get("X-Service-Token"))
		body, _ := io.ReadAll(r.Body)
		assert.JSONEq(t, `{"obj_type":"rows","hashes":["a","b"]}`, string(body))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"exists":{"a":true,"b":false}}`))
	}))
	data, status, err := client.BatchExists(context.Background(), "myrepo", []byte(`{"obj_type":"rows","hashes":["a","b"]}`))
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Contains(t, string(data), `"a":true`)
}

func TestBatchUpload(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/api/v1/repos/myrepo/objects/batch-upload", r.URL.Path)
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))
		assert.Equal(t, "test-token", r.Header.Get("X-Service-Token"))
		body, _ := io.ReadAll(r.Body)
		assert.JSONEq(t, `{"obj_type":"rows","items":[{"hash":"a","data_b64":"e30="}]}`, string(body))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"accepted":1,"errors":[]}`))
	}))
	data, status, err := client.BatchUpload(context.Background(), "myrepo", []byte(`{"obj_type":"rows","items":[{"hash":"a","data_b64":"e30="}]}`))
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Contains(t, string(data), `"accepted":1`)
}

func TestGetTree(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/api/v1/repos/myrepo/tree/abc123/", r.URL.Path)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"entries":[]}`))
	}))
	data, status, err := client.GetTree(context.Background(), "myrepo", "abc123", "")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Contains(t, string(data), "entries")
}

func TestGetNestedTree(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/api/v1/repos/myrepo/tree/abc123/eval/tool", r.URL.Path)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"entries":[]}`))
	}))
	data, status, err := client.GetTree(context.Background(), "myrepo", "abc123", "eval/tool")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Contains(t, string(data), "entries")
}

func TestGetStatsPassesPathAndIncludeSize(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/api/v1/repos/myrepo/stats/abc123", r.URL.Path)
		assert.Equal(t, "eval/tool", r.URL.Query().Get("path"))
		assert.Equal(t, "false", r.URL.Query().Get("include_size"))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"files":[]}`))
	}))
	data, status, err := client.GetStats(context.Background(), "myrepo", "abc123", "eval/tool", "false")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Contains(t, string(data), "files")
}

func TestGetDiff(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/api/v1/repos/myrepo/diff", r.URL.Path)
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))
		body, _ := io.ReadAll(r.Body)
		assert.Contains(t, string(body), `"old_commit":"old123"`)
		assert.Contains(t, string(body), `"new_commit":"new456"`)
		assert.Contains(t, string(body), `"include_rows":true`)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"files":[]}`))
	}))
	data, status, err := client.GetDiff(context.Background(), "myrepo", "old123", "new456", "", "", "")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Contains(t, string(data), "files")
}

func TestGetDiffPassesRowPaginationOptions(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/api/v1/repos/myrepo/diff", r.URL.Path)
		body, _ := io.ReadAll(r.Body)
		assert.JSONEq(t, `{
			"old_commit":"old123",
			"new_commit":"new456",
			"include_rows":true,
			"limit":50,
			"path":"train/chunk_000.jsonl",
			"offset":100
		}`, string(body))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"files":[]}`))
	}))
	data, status, err := client.GetDiff(context.Background(), "myrepo", "old123", "new456", "train/chunk_000.jsonl", "100", "50")
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
	t.Run("includes status query when provided", func(t *testing.T) {
		client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			assert.Equal(t, "/api/v1/repos/myrepo/pulls", r.URL.Path)
			assert.Equal(t, "closed", r.URL.Query().Get("status"))
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`[]`))
		}))
		data, status, err := client.ListPulls(context.Background(), "myrepo", "closed")
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, status)
		assert.Equal(t, []byte(`[]`), data)
	})

	t.Run("omits status query when empty", func(t *testing.T) {
		client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			assert.Equal(t, "/api/v1/repos/myrepo/pulls", r.URL.Path)
			assert.Empty(t, r.URL.RawQuery)
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`[]`))
		}))
		data, status, err := client.ListPulls(context.Background(), "myrepo", "")
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, status)
		assert.Equal(t, []byte(`[]`), data)
	})
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

func TestSearch(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/api/v1/repos/myrepo/search", r.URL.Path)
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))
		body, _ := io.ReadAll(r.Body)
		assert.JSONEq(t, `{"ref":"commit123","query":"needle","file":"train.jsonl","limit":50}`, string(body))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"matches":[{"row_index":3}]}`))
	}))
	data, status, err := client.Search(context.Background(), "myrepo", []byte(`{"ref":"commit123","query":"needle","file":"train.jsonl","limit":50}`))
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Contains(t, string(data), "matches")
}

func TestExportFile(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/api/v1/repos/myrepo/export/commit123/train/data.jsonl", r.URL.Path)
		assert.Equal(t, "jsonl", r.URL.Query().Get("format"))
		assert.Equal(t, "test-token", r.Header.Get("X-Service-Token"))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"messages":[]}` + "\n"))
	}))
	data, status, err := client.ExportFile(context.Background(), "myrepo", "commit123", "train/data.jsonl", "jsonl")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Contains(t, string(data), "messages")
}

func TestExportFileFallbackBuildsJSONLFromInlineManifestRows(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/repos/myrepo/export/commit123/eval.jsonl":
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"detail":"not found"}`))
		case "/api/v1/repos/myrepo/manifest/commit123/eval.jsonl":
			assert.Equal(t, "0", r.URL.Query().Get("offset"))
			assert.Equal(t, "500", r.URL.Query().Get("limit"))
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"total":2,"entries":[{"row_hash":"row-0","row":{"messages":[{"role":"user","content":"first"}]}},{"row_hash":"row-1","content":{"messages":[{"role":"user","content":"second"}]}}]}`))
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	data, status, err := client.ExportFileWithFallback(context.Background(), "myrepo", "commit123", "eval.jsonl", "jsonl")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	require.Len(t, lines, 2)
	assert.JSONEq(t, `{"messages":[{"role":"user","content":"first"}]}`, lines[0])
	assert.JSONEq(t, `{"messages":[{"role":"user","content":"second"}]}`, lines[1])
}

func TestExportFileFallbackFetchesRowObjectsWhenManifestHasHashesOnly(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/repos/myrepo/export/commit123/train.jsonl":
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"detail":"not found"}`))
		case "/api/v1/repos/myrepo/manifest/commit123/train.jsonl":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"total":1,"entries":[{"row_hash":"abc123"}]}`))
		case "/api/v1/repos/myrepo/objects/rows/abc123":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"messages":[{"role":"user","content":"from object"}]}`))
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	data, status, err := client.ExportFileWithFallback(context.Background(), "myrepo", "commit123", "train.jsonl", "")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.JSONEq(t, `{"messages":[{"role":"user","content":"from object"}]}`, strings.TrimSpace(string(data)))
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
		assert.Equal(t, "/api/v1/repos/myrepo/meta/abc123/train/sft.jsonl", r.URL.Path)
		assert.Equal(t, "test-token", r.Header.Get("X-Service-Token"))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"manifest_hash":"abc123","entries":[]}`))
	}))
	data, status, err := client.MetaGet(context.Background(), "myrepo", "abc123", "train/sft.jsonl")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Contains(t, string(data), "manifest_hash")
}

func TestMetaSummary(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/api/v1/repos/myrepo/meta/abc123/train/sft.jsonl/summary", r.URL.Path)
		assert.Equal(t, "test-token", r.Header.Get("X-Service-Token"))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"row_count":1500,"token_estimate":1130250,"lang_distribution":{"zh":0.82}}`))
	}))
	data, status, err := client.MetaSummary(context.Background(), "myrepo", "abc123", "train/sft.jsonl")
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
		assert.Empty(t, r.URL.Query().Get("file"))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"files":[]}`))
	}))
	data, status, err := client.MetaDiff(context.Background(), "myrepo", "old123", "new456", "")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Contains(t, string(data), "files")
}
