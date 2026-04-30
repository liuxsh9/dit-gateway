package integration

import (
	"net/http"
	"testing"

	"forgejo.org/modules/setting"
	"forgejo.org/routers/web/healthcheck"
	"forgejo.org/tests"

	"github.com/stretchr/testify/assert"
)

func TestApiHeatlhCheck(t *testing.T) {
	defer tests.PrepareTestEnv(t)()

	for _, path := range []string{"/api/healthz", "/api/health"} {
		req := NewRequest(t, "GET", path)
		resp := MakeRequest(t, req, http.StatusOK)
		assert.Contains(t, resp.Header().Values("Cache-Control"), "no-store")

		var status healthcheck.Response
		DecodeJSON(t, resp, &status)
		assert.Equal(t, healthcheck.Pass, status.Status)
		assert.Equal(t, setting.AppName, status.Description)
	}
}
