package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"log/slog"
	"net/http"
	"time"
	"tripcompass-backend/internal/config"
)

// EmailService sends transactional emails via Resend.
type EmailService struct {
	cfg        *config.Config
	httpClient *http.Client
}

func NewEmailService(cfg *config.Config) *EmailService {
	return &EmailService{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// IsConfigured returns true if Resend is configured.
func (s *EmailService) IsConfigured() bool {
	return s.cfg.ResendAPIKey != "" && s.cfg.ResendFrom != ""
}

// SendVerificationEmail sends a verification token to the user (token-only, no link).
func (s *EmailService) SendVerificationEmail(toEmail, fullName, token string) error {
	if !s.IsConfigured() {
		slog.Warn("resend is not fully configured; printing verification token instead",
			"api_key_set", s.cfg.ResendAPIKey != "",
			"from_set", s.cfg.ResendFrom != "",
		)
		fmt.Printf("[EMAIL] Verification token for %s: %s\n", toEmail, token)
		return nil
	}

	subject := "Mã xác minh TripCompass của bạn"
	textBody, htmlBody := verificationEmailBody(fullName, token)

	if err := s.sendEmail(toEmail, subject, textBody, htmlBody); err != nil {
		return err
	}
	slog.Info("verification email sent", "email", toEmail)
	return nil
}

// SendDuplicateRegistrationNotice notifies the account owner that someone tried
// to register with their email. Called during Register when the email already exists.
// Sends a security notification — NOT a verification email.
func (s *EmailService) SendDuplicateRegistrationNotice(toEmail, fullName string) error {
	if !s.IsConfigured() {
		slog.Warn("resend is not fully configured; skipping duplicate registration notice",
			"api_key_set", s.cfg.ResendAPIKey != "",
			"from_set", s.cfg.ResendFrom != "",
		)
		fmt.Printf("[EMAIL] Duplicate registration attempt for %s\n", toEmail)
		return nil
	}

	subject := "Ai đó đã thử đăng ký bằng email của bạn — TripCompass"
	body := fmt.Sprintf(`Xin chào %s,

Chúng tôi nhận được yêu cầu đăng ký tài khoản mới với địa chỉ email này.

Vì tài khoản đã tồn tại, chúng tôi không tạo thêm tài khoản mới.

Nếu đây là bạn, hãy đăng nhập tại: %s/login
Nếu không phải bạn, hãy bỏ qua email này.

Trân trọng,
Đội ngũ TripCompass`, fullName, s.cfg.FrontendURL)

	if err := s.sendEmail(toEmail, subject, body, ""); err != nil {
		return err
	}
	slog.Info("duplicate registration notice sent", "email", toEmail)
	return nil
}

// SendPasswordResetEmail sends a password reset link.
func (s *EmailService) SendPasswordResetEmail(toEmail, fullName, token string) error {
	if !s.IsConfigured() {
		fmt.Printf("[EMAIL] Password reset link for %s: %s/reset-password?token=%s\n",
			toEmail, s.cfg.FrontendURL, token)
		return nil
	}

	frontendURL := s.cfg.FrontendURL
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}
	resetLink := fmt.Sprintf("%s/reset-password?token=%s", frontendURL, token)

	subject := "Đặt lại mật khẩu TripCompass"
	body := fmt.Sprintf(`Xin chào %s,

Chúng tôi nhận được yêu cầu đặt lại mật khẩu của bạn.

Nhấn vào link sau để đặt lại mật khẩu:
%s

Link này có hiệu lực trong 1 giờ.

Nếu bạn không yêu cầu điều này, hãy bỏ qua email này.

Trân trọng,
Đội ngũ TripCompass`, fullName, resetLink)

	return s.sendEmail(toEmail, subject, body, "")
}

// SendCollaboratorInvite notifies the invitee that they've been invited to edit/view an itinerary.
func (s *EmailService) SendCollaboratorInvite(toEmail, inviteeName, inviterName, itineraryTitle, role string) error {
	frontendURL := s.cfg.FrontendURL
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}
	invitesLink := fmt.Sprintf("%s/invitations", frontendURL)

	if !s.IsConfigured() {
		fmt.Printf("[EMAIL] Collab invite to %s for %q (role=%s, by %s) → %s\n",
			toEmail, itineraryTitle, role, inviterName, invitesLink)
		return nil
	}

	roleLabel := "biên tập"
	if role == "VIEWER" {
		roleLabel = "xem"
	}

	subject := fmt.Sprintf("Bạn được mời cộng tác lịch trình \"%s\" — TripCompass", itineraryTitle)
	body := fmt.Sprintf(`Xin chào %s,

%s đã mời bạn %s lịch trình "%s" trên TripCompass.

Truy cập trang lời mời để chấp nhận hoặc từ chối:
%s

Nếu bạn không sử dụng TripCompass, hãy bỏ qua email này.

Trân trọng,
Đội ngũ TripCompass`, inviteeName, inviterName, roleLabel, itineraryTitle, invitesLink)

	return s.sendEmail(toEmail, subject, body, "")
}

func (s *EmailService) sendEmail(to, subject, textBody, htmlBody string) error {
	payload := struct {
		From    string   `json:"from"`
		To      []string `json:"to"`
		Subject string   `json:"subject"`
		Text    string   `json:"text,omitempty"`
		HTML    string   `json:"html,omitempty"`
	}{
		From:    s.cfg.ResendFrom,
		To:      []string{to},
		Subject: subject,
		Text:    textBody,
		HTML:    htmlBody,
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("resend payload: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("resend request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.cfg.ResendAPIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("resend send: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("resend status %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(respBody, &result); err == nil && result.ID != "" {
		slog.Info("resend accepted email", "email", to, "id", result.ID)
	}
	return nil
}

func verificationEmailBody(fullName, token string) (string, string) {
	displayName := fullName
	if displayName == "" {
		displayName = "bạn"
	}

	textBody := fmt.Sprintf(`Xin chào %s,

Mã xác minh TripCompass của bạn là: %s

Mã này có hiệu lực trong 24 giờ. Nếu bạn không tạo tài khoản TripCompass, hãy bỏ qua email này.

Trân trọng,
Đội ngũ TripCompass`, displayName, token)

	escapedName := html.EscapeString(displayName)
	escapedToken := html.EscapeString(token)
	htmlBody := fmt.Sprintf(`<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Mã xác minh TripCompass</title>
</head>
<body style="margin:0; padding:0; background:#f5f7f4; color:#1f2a24; font-family:Arial, Helvetica, sans-serif;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">
    Mã xác minh TripCompass của bạn có hiệu lực trong 24 giờ.
  </div>
  <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#f5f7f4; padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:560px; background:#fbfcf8; border:1px solid #dde5d8; border-radius:16px; overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 18px 32px;">
              <div style="font-size:20px; line-height:28px; font-weight:700; color:#24463a;">TripCompass</div>
              <div style="margin-top:6px; font-size:13px; line-height:20px; color:#68756b;">Xác minh tài khoản</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 0 32px;">
              <h1 style="margin:0; font-size:24px; line-height:32px; color:#1f2a24;">Mã xác minh của bạn</h1>
              <p style="margin:16px 0 0 0; font-size:15px; line-height:24px; color:#3d4a42;">Xin chào %s, nhập mã dưới đây để hoàn tất đăng ký TripCompass.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 32px;">
              <div style="background:#eef4e9; border:1px solid #cddbc6; border-radius:12px; padding:22px 18px; text-align:center;">
                <div style="font-size:12px; line-height:18px; letter-spacing:1.4px; text-transform:uppercase; color:#5f715d; font-weight:700;">Mã xác minh</div>
                <div style="margin-top:8px; font-family:'Courier New', Courier, monospace; font-size:34px; line-height:42px; letter-spacing:7px; color:#24463a; font-weight:700;">%s</div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px 32px;">
              <p style="margin:0; font-size:14px; line-height:22px; color:#4d5c51;">Mã này có hiệu lực trong <strong>24 giờ</strong>. Nếu bạn không tạo tài khoản TripCompass, hãy bỏ qua email này.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 28px 32px; border-top:1px solid #e4eadf;">
              <p style="margin:0; font-size:12px; line-height:18px; color:#7a857b;">Đây là email tự động từ TripCompass. Vui lòng không trả lời email này.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`, escapedName, escapedToken)

	return textBody, htmlBody
}
