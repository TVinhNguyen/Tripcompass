package services

import (
	"bytes"
	"encoding/json"
	"fmt"
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

// SendVerificationEmail sends a verification link to the user.
func (s *EmailService) SendVerificationEmail(toEmail, fullName, token string) error {
	if !s.IsConfigured() {
		// Dev fallback: print to stdout
		slog.Warn("resend is not fully configured; printing verification link instead",
			"api_key_set", s.cfg.ResendAPIKey != "",
			"from_set", s.cfg.ResendFrom != "",
		)
		fmt.Printf("[EMAIL] Verification link for %s: %s/verify?token=%s\n",
			toEmail, s.cfg.FrontendURL, token)
		return nil
	}

	subject := "Xác minh tài khoản TripCompass"
	frontendURL := s.cfg.FrontendURL
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}
	verifyLink := fmt.Sprintf("%s/verify?token=%s", frontendURL, token)

	body := fmt.Sprintf(`Xin chào %s,

Cảm ơn bạn đã đăng ký TripCompass!

Vui lòng xác minh email của bạn bằng cách nhấn vào link sau:
%s

Link này có hiệu lực trong 24 giờ.

Nếu bạn không tạo tài khoản này, hãy bỏ qua email này.

Trân trọng,
Đội ngũ TripCompass`, fullName, verifyLink)

	if err := s.sendMail(toEmail, subject, body); err != nil {
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

	if err := s.sendMail(toEmail, subject, body); err != nil {
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

	return s.sendMail(toEmail, subject, body)
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

	return s.sendMail(toEmail, subject, body)
}

func (s *EmailService) sendMail(to, subject, body string) error {
	payload := struct {
		From    string   `json:"from"`
		To      []string `json:"to"`
		Subject string   `json:"subject"`
		Text    string   `json:"text"`
	}{
		From:    s.cfg.ResendFrom,
		To:      []string{to},
		Subject: subject,
		Text:    body,
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
