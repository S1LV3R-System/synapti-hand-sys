# User Platform Design Summary

## Design Document Location
`claudedocs/USER_PLATFORM_DESIGN.md`

## Core Features Designed

### Pages
1. **Dashboard** - Stats cards, quick actions, recent activity
2. **Projects** - CRUD for research projects
3. **Patients** - Patient management with search/filter
4. **Recordings** - Recording history with status badges
5. **Profile** - User settings and account info

### Recording Workflow
- MediaPipe HandLandmarker integration
- Real-time hand landmark visualization
- Video + keypoints capture and upload
- Status tracking (uploaded → processing → analyzed)

### API Endpoints Needed
- `GET /api/users/me/stats` - Dashboard statistics
- Profile update endpoints
- Existing project/patient/recording APIs

### Components to Create
- StatsCards, QuickActions, RecentActivity (dashboard)
- RecordingStatus (status badge component)
- ProfileForm, ProfilePage

## Implementation Priority
1. Enhanced Dashboard with stats
2. Profile page
3. Recording enhancements
4. Analysis display
