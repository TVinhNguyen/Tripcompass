package services

import (
	"crypto/tls"
	"fmt"
	"net/smtp"
	"strings"
	"tripcompass-backend/internal/config"
)

// EmailService sends transactional emails via SMTP.
type EmailService struct {
	cfg *config.Config
}

func NewEmailService(cfg *config.Config) *EmailService {
	return &EmailService{cfg: cfg}
}

// IsConfigured returns true if SMTP is configured.
func (s *EmailService) IsConfigured() bool {
	return s.cfg.SMTPHost != "" && s.cfg.SMTPUser != ""
}

// SendVerificationEmail sends a verification link to the user.
func (s *EmailService) SendVerificationEmail(toEmail, fullName, token string) error {
	if !s.IsConfigured() {
		// Dev fallback: print to stdout
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

	return s.sendMail(toEmail, subject, body)
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

func (s *EmailService) sendMail(to, subject, body string) error {
	from := s.cfg.SMTPFrom
	if from == "" {
		from = s.cfg.SMTPUser
	}

	msg := strings.Join([]string{
		fmt.Sprintf("From: TripCompass <%s>", from),
		fmt.Sprintf("To: %s", to),
		fmt.Sprintf("Subject: %s", subject),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=utf-8",
		"",
		body,
	}, "\r\n")

	addr := fmt.Sprintf("%s:%s", s.cfg.SMTPHost, s.cfg.SMTPPort)
	auth := smtp.PlainAuth("", s.cfg.SMTPUser, s.cfg.SMTPPassword, s.cfg.SMTPHost)

	// Try TLS first (port 465), fallback to STARTTLS (port 587/25)
	if s.cfg.SMTPPort == "465" {
		tlsCfg := &tls.Config{ServerName: s.cfg.SMTPHost}
		conn, err := tls.Dial("tcp", addr, tlsCfg)
		if err != nil {
			return fmt.Errorf("smtp tls dial: %w", err)
		}
		client, err := smtp.NewClient(conn, s.cfg.SMTPHost)
		if err != nil {
			return fmt.Errorf("smtp client: %w", err)
		}
		defer client.Close()
		if err = client.Auth(auth); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
		if err = client.Mail(from); err != nil {
			return err
		}
		if err = client.Rcpt(to); err != nil {
			return err
		}
		w, err := client.Data()
		if err != nil {
			return err
		}
		_, err = fmt.Fprint(w, msg)
		if err != nil {
			return err
		}
		return w.Close()
	}

	// STARTTLS (port 587)
	return smtp.SendMail(addr, auth, from, []string{to}, []byte(msg))
}
