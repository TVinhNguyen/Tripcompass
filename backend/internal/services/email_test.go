package services

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestPasswordResetEmailBodyIncludesHTMLCTA(t *testing.T) {
	textBody, htmlBody := passwordResetEmailBody("", "https://tripcompass.example/reset-password?token=abc123")

	assert.Contains(t, textBody, "Xin chào bạn")
	assert.Contains(t, textBody, "https://tripcompass.example/reset-password?token=abc123")
	assert.Contains(t, htmlBody, "<title>Đặt lại mật khẩu TripCompass</title>")
	assert.Contains(t, htmlBody, "Đặt lại mật khẩu")
	assert.Contains(t, htmlBody, `href="https://tripcompass.example/reset-password?token=abc123"`)
	assert.Contains(t, htmlBody, "Đây là email tự động từ TripCompass")
}

func TestCollaboratorInviteEmailBodyEscapesUserContent(t *testing.T) {
	_, htmlBody := collaboratorInviteEmailBody(
		`<Mai>`,
		`Anh "Nam"`,
		`Lịch trình <script>alert("x")</script>`,
		"biên tập",
		"https://tripcompass.example/invitations",
	)

	assert.NotContains(t, htmlBody, `<script>`)
	assert.NotContains(t, htmlBody, `Anh "Nam"`)
	assert.Contains(t, htmlBody, "&lt;Mai&gt;")
	assert.Contains(t, htmlBody, "Anh &#34;Nam&#34;")
	assert.Contains(t, htmlBody, "Lịch trình &lt;script&gt;alert(&#34;x&#34;)&lt;/script&gt;")
	assert.Contains(t, htmlBody, "Bạn được mời vào một lịch trình")
}
