// Package services — admin_activity.go
//
// Recent-activity feed for the admin dashboard. Unions three event sources
// (signups / itineraries / places) into one chronological stream. Each source
// is capped at `limit` so a popular table can't crowd out the others; the
// merged result is then re-sorted and trimmed to `limit`.

package services

import (
	"fmt"
	"time"

	"gorm.io/gorm"
)

type AdminActivityService struct {
	db *gorm.DB
}

func NewAdminActivityService(db *gorm.DB) *AdminActivityService {
	return &AdminActivityService{db: db}
}

// ActivityEvent is the union shape the dashboard renders. user_name + avatar
// are denormalized in SQL so the JSON consumer doesn't need a second lookup.
type ActivityEvent struct {
	User   string    `json:"user"`
	Avatar string    `json:"avatar"`
	Action string    `json:"action"`
	Item   string    `json:"item"`
	Time   time.Time `json:"time"`
}

// activityRow mirrors what each subquery scans into. Kept private so callers
// only see the cleaned ActivityEvent.
type activityRow struct {
	User      string
	AvatarURL *string
	Action    string
	Item      string
	Time      time.Time
}

func (s *AdminActivityService) Recent(limit int) ([]ActivityEvent, error) {
	if limit <= 0 || limit > 50 {
		limit = 10
	}

	var events []activityRow

	// New users
	var users []activityRow
	if err := s.db.Raw(`
		SELECT u.full_name AS user, u.avatar_url AS avatar_url,
		       'đã đăng ký' AS action, '' AS item, u.created_at AS time
		FROM users u
		ORDER BY u.created_at DESC
		LIMIT ?
	`, limit).Scan(&users).Error; err != nil {
		return nil, fmt.Errorf("scan user activity: %w", err)
	}
	events = append(events, users...)

	// New itineraries
	var itins []activityRow
	if err := s.db.Raw(`
		SELECT u.full_name AS user, u.avatar_url AS avatar_url,
		       'đã tạo lịch trình' AS action, i.title AS item, i.created_at AS time
		FROM itineraries i
		JOIN users u ON u.id = i.owner_id
		ORDER BY i.created_at DESC
		LIMIT ?
	`, limit).Scan(&itins).Error; err != nil {
		return nil, fmt.Errorf("scan itinerary activity: %w", err)
	}
	events = append(events, itins...)

	// New places (admin-curated, so attribute to the system)
	var places []activityRow
	if err := s.db.Raw(`
		SELECT 'Hệ thống' AS user, NULL AS avatar_url,
		       'thêm địa điểm' AS action, p.name AS item, p.created_at AS time
		FROM places p
		ORDER BY p.created_at DESC
		LIMIT ?
	`, limit).Scan(&places).Error; err != nil {
		return nil, fmt.Errorf("scan place activity: %w", err)
	}
	events = append(events, places...)

	// Tiny n (≤ limit*3, limit≤50). Insertion sort by time desc — std sort
	// works too but the interface conversion is heavier for this size.
	for i := 1; i < len(events); i++ {
		for j := i; j > 0 && events[j].Time.After(events[j-1].Time); j-- {
			events[j], events[j-1] = events[j-1], events[j]
		}
	}
	if len(events) > limit {
		events = events[:limit]
	}

	out := make([]ActivityEvent, len(events))
	for i, r := range events {
		avatar := ""
		if r.AvatarURL != nil {
			avatar = *r.AvatarURL
		}
		out[i] = ActivityEvent{
			User: r.User, Avatar: avatar, Action: r.Action,
			Item: r.Item, Time: r.Time,
		}
	}
	return out, nil
}
