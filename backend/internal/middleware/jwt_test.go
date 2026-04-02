package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
)

const testSecret = "test-secret-key"

func init() {
	gin.SetMode(gin.TestMode)
}

// helper: create a valid JWT token string
func createToken(t *testing.T, secret string, claims jwt.MapClaims) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}
	return signed
}

// helper: create a Gin test context with optional Authorization header
func createTestRequest(authHeader string) (*gin.Context, *httptest.ResponseRecorder) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	if authHeader != "" {
		req.Header.Set("Authorization", authHeader)
	}
	c.Request = req
	return c, w
}

func TestJWTAuth_ValidToken(t *testing.T) {
	claims := jwt.MapClaims{
		"sub": "user-123",
		"exp": time.Now().Add(time.Hour).Unix(),
		"iat": time.Now().Unix(),
	}
	token := createToken(t, testSecret, claims)

	c, _ := createTestRequest("Bearer " + token)
	handler := JWTAuth(testSecret)
	handler(c)

	assert.False(t, c.IsAborted())
	userID, exists := c.Get(UserIDKey)
	assert.True(t, exists)
	assert.Equal(t, "user-123", userID)
}

func TestJWTAuth_MissingHeader(t *testing.T) {
	c, w := createTestRequest("")
	handler := JWTAuth(testSecret)
	handler(c)

	assert.True(t, c.IsAborted())
	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "missing or invalid Authorization header")
}

func TestJWTAuth_InvalidBearerFormat(t *testing.T) {
	c, w := createTestRequest("Token abc123")
	handler := JWTAuth(testSecret)
	handler(c)

	assert.True(t, c.IsAborted())
	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "missing or invalid Authorization header")
}

func TestJWTAuth_BearerWithoutToken(t *testing.T) {
	c, w := createTestRequest("Bearer ")
	handler := JWTAuth(testSecret)
	handler(c)

	assert.True(t, c.IsAborted())
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestJWTAuth_ExpiredToken(t *testing.T) {
	claims := jwt.MapClaims{
		"sub": "user-123",
		"exp": time.Now().Add(-time.Hour).Unix(), // expired 1 hour ago
		"iat": time.Now().Add(-2 * time.Hour).Unix(),
	}
	token := createToken(t, testSecret, claims)

	c, w := createTestRequest("Bearer " + token)
	handler := JWTAuth(testSecret)
	handler(c)

	assert.True(t, c.IsAborted())
	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "invalid or expired token")
}

func TestJWTAuth_WrongSecret(t *testing.T) {
	claims := jwt.MapClaims{
		"sub": "user-123",
		"exp": time.Now().Add(time.Hour).Unix(),
		"iat": time.Now().Unix(),
	}
	// Sign with different secret
	token := createToken(t, "wrong-secret", claims)

	c, w := createTestRequest("Bearer " + token)
	handler := JWTAuth(testSecret)
	handler(c)

	assert.True(t, c.IsAborted())
	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "invalid or expired token")
}

func TestJWTAuth_NonHMACAlgorithm(t *testing.T) {
	// Create a token signed with RSA (but use HMAC as a workaround for testing)
	// The middleware checks t.Method.(*jwt.SigningMethodHMAC)
	// We simulate this by creating a token with a non-HMAC method marker
	claims := jwt.MapClaims{
		"sub": "user-123",
		"exp": time.Now().Add(time.Hour).Unix(),
		"iat": time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodNone, claims)
	tokenStr, _ := token.SignedString(jwt.UnsafeAllowNoneSignatureType)

	c, w := createTestRequest("Bearer " + tokenStr)
	handler := JWTAuth(testSecret)
	handler(c)

	assert.True(t, c.IsAborted())
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestJWTAuth_MissingSubClaim(t *testing.T) {
	claims := jwt.MapClaims{
		"exp": time.Now().Add(time.Hour).Unix(),
		"iat": time.Now().Unix(),
		// no "sub" claim
	}
	token := createToken(t, testSecret, claims)

	c, w := createTestRequest("Bearer " + token)
	handler := JWTAuth(testSecret)
	handler(c)

	assert.True(t, c.IsAborted())
	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "invalid token subject")
}

func TestJWTAuth_EmptySubClaim(t *testing.T) {
	claims := jwt.MapClaims{
		"sub": "",
		"exp": time.Now().Add(time.Hour).Unix(),
		"iat": time.Now().Unix(),
	}
	token := createToken(t, testSecret, claims)

	c, w := createTestRequest("Bearer " + token)
	handler := JWTAuth(testSecret)
	handler(c)

	assert.True(t, c.IsAborted())
	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "invalid token subject")
}

func TestJWTAuth_SubClaimWrongType(t *testing.T) {
	claims := jwt.MapClaims{
		"sub": 12345, // not a string
		"exp": time.Now().Add(time.Hour).Unix(),
		"iat": time.Now().Unix(),
	}
	token := createToken(t, testSecret, claims)

	c, w := createTestRequest("Bearer " + token)
	handler := JWTAuth(testSecret)
	handler(c)

	assert.True(t, c.IsAborted())
	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "invalid token subject")
}

func TestJWTAuth_MalformedToken(t *testing.T) {
	c, w := createTestRequest("Bearer not.a.valid.jwt.token")
	handler := JWTAuth(testSecret)
	handler(c)

	assert.True(t, c.IsAborted())
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}
