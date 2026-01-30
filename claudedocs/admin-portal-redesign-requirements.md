# Admin Portal Redesign - Requirements Specification

**Date**: 2026-01-13
**Project**: HandPose Medical Platform
**Scope**: Admin Portal UI/UX Redesign + Self-Registration System
**Strategy**: Incremental Enhancement with Ant Design

---

## 🎯 Project Overview

### Vision
Transform the admin portal into a modern administrative command center with:
- Real-time system monitoring and health visibility
- Comprehensive supervision and control capabilities
- Streamlined user approval workflows
- Efficient task execution with modern UI patterns

### Strategic Approach
- **Implementation**: Incremental enhancement (no big-bang rewrite)
- **UI Framework**: Ant Design (enterprise-grade components)
- **Real-time**: Hybrid (WebSocket for alerts + React Query polling for stats)
- **Design Style**: Modern minimalist (Vercel/Linear aesthetic)

---

## 📊 Core Feature Requirements

### 1. Real-Time Activity Monitoring

**Dashboard Widgets:**

```typescript
interface MonitoringDashboard {
  liveMetrics: {
    activeUsers: number;           // Users currently online
    activeRecordings: number;       // In-progress recording sessions
    processingQueue: number;        // Videos being analyzed
    systemLoad: {
      cpu: number;
      memory: number;
      storage: number;
    };
  };

  recentActivity: {
    timestamp: Date;
    user: string;
    action: 'login' | 'upload' | 'analyze' | 'export';
    status: 'success' | 'warning' | 'error';
    details: string;
  }[];

  alerts: {
    severity: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    timestamp: Date;
    actionRequired: boolean;
  }[];
}
```

**Visual Components:**
- Live activity feed (WebSocket-powered, scrollable, filterable)
- System resource gauges (CPU, memory, storage with color-coded status)
- Active users list with current actions
- Processing queue visualization (pending → processing → complete)

**Ant Design Components:**
- `Statistic` + `Card` for metrics
- `Timeline` for activity feed
- `Progress` for system resources
- `Badge` for alert counts

---

### 2. Audit Logs & Compliance

**Requirements:**
- **HIPAA Compliance**: Track all PHI access and modifications
- **User Action History**: Who did what, when, and from where
- **Data Access Logs**: Recording views, exports, deletions
- **Security Events**: Failed logins, permission changes, suspicious activity

**Schema:**
```typescript
interface AuditLogEntry {
  id: string;
  timestamp: Date;
  userId: string;
  userEmail: string;
  userRole: 'admin' | 'clinician';
  action: AuditAction;
  resourceType: 'user' | 'recording' | 'patient' | 'project' | 'system';
  resourceId?: string;
  changes?: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  ipAddress: string;
  userAgent: string;
  status: 'success' | 'failure';
  reason?: string;  // For failures or rejections
}

type AuditAction =
  | 'user.create' | 'user.approve' | 'user.reject' | 'user.deactivate'
  | 'user.role_change' | 'user.login' | 'user.logout'
  | 'recording.view' | 'recording.export' | 'recording.delete'
  | 'patient.create' | 'patient.update' | 'patient.delete'
  | 'system.config_change' | 'system.backup' | 'system.restore';
```

**UI Features:**
- Advanced filtering (date range, user, action type, resource)
- Export to CSV/JSON for compliance reporting
- Real-time log streaming for security monitoring
- Retention policy configuration (default 90 days)

**Ant Design Components:**
- `Table` with virtual scrolling for large logs
- `DatePicker.RangePicker` for date filters
- `Select` with `mode="multiple"` for action filters
- `Drawer` for detailed log entry view

---

### 3. User Performance Metrics

**Clinician Analytics:**
```typescript
interface ClinicianMetrics {
  clinicianId: string;
  clinicianName: string;
  period: 'day' | 'week' | 'month' | 'quarter';

  productivity: {
    recordingsCreated: number;
    recordingsAnalyzed: number;
    patientsManaged: number;
    avgRecordingDuration: number; // seconds
    avgProcessingTime: number;    // seconds
  };

  quality: {
    recordingQualityScore: number; // 0-100, based on analysis success
    annotationCompleteness: number; // % of required fields filled
    reprocessingRate: number;       // % of recordings needing redo
  };

  engagement: {
    loginFrequency: number;         // logins per week
    avgSessionDuration: number;     // minutes
    lastActive: Date;
  };
}
```

**Visualization:**
- Leaderboard table (top performers)
- Trend charts (productivity over time)
- Quality score distribution (histogram)
- Individual clinician detail view

**Ant Design Components:**
- `Table` with sortable columns + row expansion
- `Chart` (via `@ant-design/charts` - based on G2Plot)
- `Tabs` for switching between metrics views
- `Tag` for quality score badges

---

### 4. Content Moderation

**Recording Review Queue:**
```typescript
interface RecordingModerationItem {
  recordingId: string;
  uploadedBy: string;
  uploadedAt: Date;
  patientInfo: {
    id: string;
    name: string;  // Masked: "Patient ***45"
  };
  status: 'pending_review' | 'approved' | 'flagged' | 'rejected';
  flags: {
    type: 'quality_issue' | 'protocol_violation' | 'data_integrity' | 'privacy_concern';
    severity: 'low' | 'medium' | 'high';
    description: string;
    flaggedBy: 'system' | 'clinician' | 'admin';
  }[];
  videoPreview: string;  // Thumbnail URL
  duration: number;
  fileSize: number;
}
```

**Admin Actions:**
- Review flagged recordings with video player
- Approve/reject with reason
- Request resubmission from clinician
- Delete permanently (with audit trail)

**Ant Design Components:**
- `List` with `Grid` for recording cards
- `Modal` with embedded video player
- `Form` for rejection reason
- `Popconfirm` for destructive actions

---

### 5. User Management (Enhanced)

**User States & Workflow:**

```
┌─────────────────┐
│  Registration   │
│  (Login page)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Pending        │ ◄── Email verification required
│  Approval       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Admin Review   │ ◄── Manual approval (this screen)
│                 │
│  Actions:       │
│  - Approve →────┼──► Active User
│  - Reject  →────┼──► Rejected (can appeal)
│  - Request Info │
└─────────────────┘
```

**Enhanced User Management Panel:**

**Current (Basic):**
- Table with email, name, role, status
- Dropdown to change role
- Activate/Deactivate button

**Redesigned:**

```typescript
interface EnhancedUserListView {
  filters: {
    status: 'all' | 'pending' | 'active' | 'inactive' | 'rejected';
    role: 'all' | 'admin' | 'clinician';
    search: string;  // Email, name
    dateRange?: [Date, Date];  // Registration date
  };

  bulkActions: {
    approve: (userIds: string[]) => void;
    reject: (userIds: string[], reason: string) => void;
    changeRole: (userIds: string[], newRole: string) => void;
    deactivate: (userIds: string[]) => void;
  };

  userCard: {
    basicInfo: { email, name, role, status };
    credentials: {
      institution?: string;
      license?: string;
      verificationStatus: 'pending' | 'verified' | 'failed';
    };
    activity: {
      registeredAt: Date;
      lastLogin?: Date;
      recordingCount: number;
      patientCount: number;
    };
    adminNotes: string;  // Private notes about this user
  };
}
```

**Ant Design Components:**
- `Table` with `rowSelection` for bulk actions
- `Drawer` for detailed user view (replaces modal)
- `Steps` for approval workflow visualization
- `Comment` component for admin notes/history
- `Descriptions` for user credential display

**Pending Approval Tab Redesign:**

**Before:**
```
Simple table: Email | Name | Role | Applied At | Actions (Approve/Reject)
```

**After:**
```typescript
<Card title="Pending User Approvals" extra={<Badge count={pendingCount} />}>
  <Tabs>
    <TabPane tab="Review Queue" key="queue">
      {/* Sorted by registration date, oldest first */}
      <List
        dataSource={pendingUsers}
        renderItem={(user) => (
          <List.Item
            actions={[
              <Button type="primary">Approve</Button>,
              <Button danger>Reject</Button>,
              <Button>Request Info</Button>
            ]}
          >
            <List.Item.Meta
              avatar={<Avatar>{user.firstName[0]}</Avatar>}
              title={user.fullName}
              description={
                <>
                  <Tag color="blue">{user.requestedRole}</Tag>
                  <Text type="secondary">{user.email}</Text>
                </>
              }
            />
            <div>
              {user.institution && <Tag>📍 {user.institution}</Tag>}
              {user.licenseNumber && <Tag>🔖 License #{user.licenseNumber}</Tag>}
              <Text type="secondary">
                Applied {dayjs(user.createdAt).fromNow()}
              </Text>
            </div>
          </List.Item>
        )}
      />
    </TabPane>

    <TabPane tab="Rejected History" key="rejected">
      {/* Show rejected users with appeal option */}
    </TabPane>
  </Tabs>
</Card>
```

---

## 🔐 Self-Registration System

### Login Page Enhancement

**Current:** Simple login form with demo credentials display

**Redesigned:**

```typescript
// LoginPage.tsx structure
<Layout>
  <Row gutter={48} align="middle" style={{ minHeight: '100vh' }}>
    {/* Left: Branding + Info */}
    <Col xs={24} lg={12}>
      <Space direction="vertical" size="large">
        <Title level={1}>HandPose Medical Platform</Title>
        <Paragraph>
          Advanced hand pose analysis for clinical assessment and research.
        </Paragraph>
        <List
          dataSource={[
            'HIPAA-compliant data storage',
            'Real-time pose tracking',
            'Comprehensive analytics dashboard'
          ]}
          renderItem={item => (
            <List.Item>
              <CheckCircleOutlined style={{ color: '#52c41a' }} /> {item}
            </List.Item>
          )}
        />
      </Space>
    </Col>

    {/* Right: Login/Register Forms */}
    <Col xs={24} lg={12}>
      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          {/* Tab 1: Sign In */}
          <TabPane tab="Sign In" key="login">
            <Form onFinish={handleLogin}>
              <Form.Item name="email" rules={[/* validation */]}>
                <Input prefix={<MailOutlined />} placeholder="Email" />
              </Form.Item>
              <Form.Item name="password" rules={[/* validation */]}>
                <Input.Password prefix={<LockOutlined />} />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" block>
                  Sign In
                </Button>
              </Form.Item>
            </Form>

            <Divider>Demo Accounts</Divider>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Alert
                message="Admin: admin@handpose.com / Admin123!"
                type="info"
              />
              <Alert
                message="Clinician: clinician@handpose.com / Clinic123!"
                type="info"
              />
            </Space>
          </TabPane>

          {/* Tab 2: Create Account */}
          <TabPane tab="Create Account" key="register">
            <RegistrationForm />
          </TabPane>
        </Tabs>
      </Card>
    </Col>
  </Row>
</Layout>
```

### Registration Form Design

```typescript
interface RegistrationFormData {
  // Basic Info
  email: string;              // Validated: institutional domain preferred
  password: string;           // Min 12 chars, complexity requirements
  confirmPassword: string;

  firstName: string;
  lastName: string;
  requestedRole: 'clinician'; // Only clinician can self-register

  // Professional Credentials
  institution?: string;       // Optional but recommended
  department?: string;
  licenseNumber?: string;     // Medical license (validated format)
  licenseState?: string;

  // Verification
  institutionalEmail?: string; // If different from primary email
  verificationCode?: string;   // If institution requires pre-authorization

  // Agreements
  agreedToTerms: boolean;
  agreedToHIPAA: boolean;
}

// Multi-step form with validation
<Steps current={currentStep}>
  <Step title="Account Info" />
  <Step title="Credentials" />
  <Step title="Verification" />
  <Step title="Review" />
</Steps>

{/* Step 1: Account Info */}
{currentStep === 0 && (
  <>
    <Form.Item name="email" rules={[
      { required: true, type: 'email' },
      { validator: validateInstitutionalEmail }  // Warn if not .edu/.org
    ]}>
      <Input
        prefix={<MailOutlined />}
        placeholder="Professional email address"
        suffix={
          <Tooltip title="Use your institutional email for faster approval">
            <InfoCircleOutlined />
          </Tooltip>
        }
      />
    </Form.Item>

    <Form.Item
      name="password"
      rules={[
        { required: true, min: 12 },
        { pattern: /(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&])/ }
      ]}
      help="Min 12 characters with uppercase, lowercase, number, and special character"
    >
      <Input.Password prefix={<LockOutlined />} />
    </Form.Item>

    <Form.Item dependencies={['password']} /* ... confirm password ... *//>

    <Form.Item>
      <Input.Group compact>
        <Input
          style={{ width: '50%' }}
          placeholder="First Name"
        />
        <Input
          style={{ width: '50%' }}
          placeholder="Last Name"
        />
      </Input.Group>
    </Form.Item>
  </>
)}

{/* Step 2: Professional Credentials */}
{currentStep === 1 && (
  <>
    <Alert
      message="Credential Verification"
      description="Providing professional credentials speeds up the approval process."
      type="info"
      showIcon
      style={{ marginBottom: 16 }}
    />

    <Form.Item name="institution" label="Institution/Hospital">
      <AutoComplete
        options={institutionSuggestions}  // Pre-populated common hospitals
        placeholder="Start typing..."
      />
    </Form.Item>

    <Form.Item name="department" label="Department (Optional)">
      <Select>
        <Option value="neurology">Neurology</Option>
        <Option value="orthopedics">Orthopedics</Option>
        <Option value="rehabilitation">Rehabilitation</Option>
        <Option value="research">Research</Option>
        <Option value="other">Other</Option>
      </Select>
    </Form.Item>

    <Form.Item label="Medical License">
      <Input.Group compact>
        <Form.Item name="licenseState" noStyle>
          <Select style={{ width: '40%' }} placeholder="State">
            {US_STATES.map(state => (
              <Option key={state.code} value={state.code}>
                {state.name}
              </Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="licenseNumber" noStyle>
          <Input
            style={{ width: '60%' }}
            placeholder="License number"
          />
        </Form.Item>
      </Input.Group>
    </Form.Item>
  </>
)}

{/* Step 3: Verification (Optional based on email domain) */}
{currentStep === 2 && institutionRequiresVerification && (
  <>
    <Result
      icon={<MailOutlined />}
      title="Email Verification Required"
      subTitle={`We've sent a verification code to ${formData.email}`}
      extra={
        <Form.Item name="verificationCode">
          <Input.OTP length={6} />
        </Form.Item>
      }
    />

    <Button type="link" onClick={resendVerificationCode}>
      Resend code
    </Button>
  </>
)}

{/* Step 4: Review & Submit */}
{currentStep === 3 && (
  <>
    <Descriptions title="Application Summary" bordered>
      <Descriptions.Item label="Email">{formData.email}</Descriptions.Item>
      <Descriptions.Item label="Name">
        {formData.firstName} {formData.lastName}
      </Descriptions.Item>
      <Descriptions.Item label="Role">
        <Tag color="blue">Clinician</Tag>
      </Descriptions.Item>
      <Descriptions.Item label="Institution">
        {formData.institution || 'Not provided'}
      </Descriptions.Item>
      <Descriptions.Item label="License">
        {formData.licenseNumber
          ? `${formData.licenseState} ${formData.licenseNumber}`
          : 'Not provided'
        }
      </Descriptions.Item>
    </Descriptions>

    <Divider />

    <Form.Item
      name="agreedToTerms"
      valuePropName="checked"
      rules={[{ validator: (_, value) => value ? Promise.resolve() : Promise.reject('Required') }]}
    >
      <Checkbox>
        I agree to the <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>
      </Checkbox>
    </Form.Item>

    <Form.Item
      name="agreedToHIPAA"
      valuePropName="checked"
      rules={[{ validator: (_, value) => value ? Promise.resolve() : Promise.reject('Required') }]}
    >
      <Checkbox>
        I acknowledge HIPAA compliance requirements and will handle patient data responsibly
      </Checkbox>
    </Form.Item>
  </>
)}
```

### Post-Registration Flow

**Success Screen:**
```typescript
<Result
  status="success"
  title="Application Submitted Successfully!"
  subTitle={
    <>
      <Paragraph>
        Your account application has been submitted for admin review.
      </Paragraph>
      <Paragraph>
        <Text strong>What happens next?</Text>
      </Paragraph>
      <Timeline>
        <Timeline.Item color="green">
          <Text>✓ Email verification sent to {email}</Text>
        </Timeline.Item>
        <Timeline.Item color="blue">
          <Text>⏳ Admin reviews your credentials (typically 1-3 business days)</Text>
        </Timeline.Item>
        <Timeline.Item>
          <Text>✉️ You'll receive an email when approved</Text>
        </Timeline.Item>
        <Timeline.Item>
          <Text>🎉 Login and start using HandPose</Text>
        </Timeline.Item>
      </Timeline>
    </>
  }
  extra={[
    <Button type="primary" onClick={() => navigate('/login')}>
      Back to Login
    </Button>,
    <Button onClick={() => window.location.href = 'mailto:support@handpose.com'}>
      Contact Support
    </Button>
  ]}
/>
```

**Email Notifications:**

1. **To User (Immediate):**
```
Subject: Welcome to HandPose - Email Verification Required

Hi [FirstName],

Thank you for registering for HandPose Medical Platform!

Please verify your email address by clicking the link below:
[Verify Email Button]

Your application details:
- Email: [email]
- Role: Clinician
- Institution: [institution]
- License: [state] [number]

Your application is now pending admin approval. You'll receive another email when your account is approved, typically within 1-3 business days.

If you have any questions, contact us at support@handpose.com

Best regards,
HandPose Team
```

2. **To Admin (Immediate):**
```
Subject: [Action Required] New User Registration - [User Name]

A new user has registered and is awaiting approval:

👤 User: [FirstName] [LastName]
📧 Email: [email] ✓ Verified
🏥 Institution: [institution]
🔖 License: [state] [number]
📅 Registered: [timestamp]

Review and approve: [Link to Admin Panel]

Auto-reject in 7 days if no action taken.
```

3. **To User (After Admin Approval):**
```
Subject: Your HandPose Account Has Been Approved! 🎉

Hi [FirstName],

Great news! Your HandPose account has been approved by our admin team.

You can now login and start using the platform:
[Login Button]

Your account details:
- Email: [email]
- Role: Clinician
- Access level: Full platform features

Need help getting started? Check out our Quick Start Guide: [link]

Welcome to HandPose!
```

4. **To User (After Rejection with Reason):**
```
Subject: HandPose Application Status Update

Hi [FirstName],

Thank you for your interest in HandPose Medical Platform.

After reviewing your application, we're unable to approve your account at this time for the following reason:

[Admin provided reason]

You may reapply after 30 days or appeal this decision by replying to this email with additional documentation.

If you believe this was a mistake, please contact support@handpose.com

Best regards,
HandPose Team
```

---

## 🎨 Design System Specifications

### Color Palette (Modern Minimalist + Medical Trust)

```typescript
const theme = {
  primary: {
    main: '#1677ff',      // Ant Design blue (trust, professional)
    light: '#4096ff',
    dark: '#0958d9'
  },

  success: {
    main: '#52c41a',      // Approved, healthy, active
    light: '#73d13d',
    dark: '#389e0d'
  },

  warning: {
    main: '#faad14',      // Pending, attention needed
    light: '#ffc53d',
    dark: '#d48806'
  },

  error: {
    main: '#ff4d4f',      // Rejected, critical, failed
    light: '#ff7875',
    dark: '#cf1322'
  },

  neutral: {
    white: '#ffffff',
    gray50: '#fafafa',
    gray100: '#f5f5f5',
    gray200: '#f0f0f0',
    gray300: '#d9d9d9',
    gray400: '#bfbfbf',
    gray500: '#8c8c8c',
    gray600: '#595959',
    gray700: '#434343',
    gray800: '#262626',
    gray900: '#1f1f1f',
    black: '#000000'
  },

  semantic: {
    info: '#1677ff',      // Informational
    processing: '#722ed1', // Analysis in progress (purple)
    archived: '#8c8c8c'   // Inactive/archived
  }
};

// Status color mapping
const statusColors = {
  // User statuses
  'pending': 'warning',    // Pending approval
  'active': 'success',     // Active user
  'inactive': 'default',   // Deactivated
  'rejected': 'error',     // Rejected application

  // Recording statuses
  'uploaded': 'processing',     // Uploaded, not analyzed
  'processing': 'processing',   // Currently analyzing
  'analyzed': 'success',        // Analysis complete
  'failed': 'error',           // Analysis failed

  // Alert severity
  'info': 'info',
  'warning': 'warning',
  'error': 'error',
  'critical': 'error'  // Use error color with pulsing animation
};
```

### Typography

```typescript
const typography = {
  fontFamily: {
    primary: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace'
  },

  fontSize: {
    xs: '12px',     // Table cells, captions
    sm: '14px',     // Body text, forms
    base: '16px',   // Default
    lg: '18px',     // Section headers
    xl: '20px',     // Card titles
    '2xl': '24px',  // Page titles
    '3xl': '30px',  // Dashboard title
    '4xl': '38px'   // Hero text
  },

  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700
  },

  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75
  }
};
```

### Spacing & Layout

```typescript
const spacing = {
  // Base unit: 4px (Ant Design default)
  xs: '4px',     // Tight spacing
  sm: '8px',     // Small gaps
  md: '16px',    // Default spacing
  lg: '24px',    // Section spacing
  xl: '32px',    // Page spacing
  '2xl': '48px', // Major sections
  '3xl': '64px'  // Hero spacing
};

const layout = {
  containerMaxWidth: '1440px',  // Dashboard max width
  sidebarWidth: '240px',        // Collapsed: 80px
  headerHeight: '64px',

  breakpoints: {
    xs: '480px',   // Mobile
    sm: '576px',   // Mobile landscape
    md: '768px',   // Tablet
    lg: '992px',   // Desktop
    xl: '1200px',  // Large desktop
    xxl: '1600px'  // Extra large
  }
};
```

### Component Styling Guidelines

**Cards:**
```typescript
const cardStyles = {
  border: '1px solid #f0f0f0',
  borderRadius: '8px',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03), 0 2px 4px rgba(0, 0, 0, 0.04)',
  padding: '24px',

  // Hover state for interactive cards
  hover: {
    borderColor: '#d9d9d9',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
    transition: 'all 0.3s ease'
  }
};
```

**Tables:**
```typescript
const tableStyles = {
  rowHeight: '56px',
  headerBg: '#fafafa',
  hoverBg: '#f5f5f5',
  selectedBg: '#e6f4ff',
  border: '1px solid #f0f0f0',

  // Sticky header for long tables
  stickyHeader: true,
  scrollY: 'calc(100vh - 320px)',  // Auto-height based on viewport

  // Pagination
  pageSize: 20,
  showSizeChanger: true,
  pageSizeOptions: ['10', '20', '50', '100']
};
```

**Buttons:**
```typescript
const buttonStyles = {
  primary: {
    background: '#1677ff',
    hover: '#4096ff',
    active: '#0958d9'
  },

  danger: {
    background: '#ff4d4f',
    hover: '#ff7875',
    active: '#cf1322'
  },

  // Button sizes
  large: { height: '48px', fontSize: '16px' },
  default: { height: '40px', fontSize: '14px' },
  small: { height: '32px', fontSize: '14px' }
};
```

---

## 🏗️ Component Architecture

### Admin Portal Structure

```
src/pages/admin/
├── AdminDashboard.tsx           # Main dashboard layout
│   ├── DashboardHeader.tsx      # User info, notifications, settings
│   ├── ActivityMonitor.tsx      # Real-time activity feed
│   ├── SystemHealthWidget.tsx   # CPU, memory, storage gauges
│   ├── QuickStatsCards.tsx      # Total users, recordings, etc.
│   └── AlertsCenter.tsx         # Critical alerts panel
│
├── UserManagement/
│   ├── UserManagementPanel.tsx  # Main user management container
│   ├── UserListTable.tsx        # Enhanced table with filters
│   ├── UserDetailDrawer.tsx     # Detailed user view (replaces modal)
│   ├── PendingApprovalsTab.tsx  # Pending users review queue
│   ├── BulkActionsToolbar.tsx   # Multi-select action bar
│   └── UserActivityTimeline.tsx # Individual user action history
│
├── Monitoring/
│   ├── RealTimeMonitor.tsx      # Live activity dashboard
│   ├── AuditLogViewer.tsx       # Comprehensive audit logs
│   ├── PerformanceMetrics.tsx   # Clinician analytics
│   └── SystemHealthDashboard.tsx # Infrastructure monitoring
│
├── ContentModeration/
│   ├── RecordingReviewQueue.tsx # Flagged recordings
│   ├── RecordingPlayerModal.tsx # Video review interface
│   └── ModerationActionsPanel.tsx # Approve/reject/flag actions
│
└── Settings/
    ├── SystemConfiguration.tsx  # Global settings
    ├── EmailTemplates.tsx       # Notification templates
    └── ComplianceSettings.tsx   # HIPAA, retention policies
```

### Registration Components

```
src/pages/auth/
├── LoginPage.tsx                # Enhanced login + register tabs
├── RegistrationForm/
│   ├── RegistrationWizard.tsx   # Multi-step form container
│   ├── AccountInfoStep.tsx      # Step 1: Email, password, name
│   ├── CredentialsStep.tsx      # Step 2: Institution, license
│   ├── VerificationStep.tsx     # Step 3: Email verification
│   ├── ReviewStep.tsx           # Step 4: Summary + agreements
│   └── SuccessResult.tsx        # Post-registration success screen
│
└── shared/
    ├── InstitutionAutocomplete.tsx # Hospital/institution search
    └── LicenseValidator.tsx        # License number format validation
```

---

## 🔌 Backend API Requirements

### New Endpoints Needed

#### 1. User Registration & Approval

```typescript
// POST /api/auth/register
// Public endpoint for self-registration
interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  requestedRole: 'clinician';
  institution?: string;
  department?: string;
  licenseNumber?: string;
  licenseState?: string;
  institutionalEmail?: string;
}

interface RegisterResponse {
  success: boolean;
  message: string;
  userId: string;
  verificationEmailSent: boolean;
}

// POST /api/auth/verify-email
interface VerifyEmailRequest {
  userId: string;
  verificationCode: string;
}

// GET /api/admin/pending-users
// Returns users with isApproved = null/false
interface PendingUser {
  id: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  requestedRole: string;
  institution?: string;
  licenseNumber?: string;
  licenseState?: string;
  createdAt: Date;
  ipAddress?: string;  // For security audit
}

// POST /api/admin/users/:id/approve
interface ApprovalRequest {
  approved: boolean;
  reason?: string;  // Required if rejected
  assignedRole?: 'clinician' | 'admin';  // Override requested role if needed
}

// POST /api/admin/users/:id/request-info
interface RequestInfoEmail {
  userId: string;
  requestedInfo: string[];  // ['license_verification', 'institution_confirmation']
  customMessage?: string;
}
```

#### 2. Real-Time Monitoring

```typescript
// WebSocket endpoint
// WS /api/admin/live-activity
interface ActivityEvent {
  type: 'user.login' | 'user.logout' | 'recording.upload' | 'recording.analyzed' | 'alert';
  timestamp: Date;
  userId?: string;
  data: any;
}

// GET /api/admin/system-health
interface SystemHealth {
  status: 'healthy' | 'degraded' | 'critical';
  metrics: {
    cpu: { usage: number; cores: number };
    memory: { used: number; total: number; percentage: number };
    storage: { used: number; total: number; percentage: number };
  };
  services: {
    database: 'up' | 'down';
    processingService: 'up' | 'down';
    redis: 'up' | 'down';
  };
  activeUsers: number;
  activeRecordings: number;
  processingQueue: number;
}

// Polling endpoint for non-critical stats
// GET /api/admin/dashboard-stats
interface DashboardStats {
  users: {
    total: number;
    active: number;
    pending: number;
    byRole: Record<string, number>;
  };
  recordings: {
    total: number;
    today: number;
    processing: number;
    byStatus: Record<string, number>;
  };
  performance: {
    avgProcessingTime: number;  // milliseconds
    successRate: number;         // percentage
  };
}
```

#### 3. Audit Logs

```typescript
// GET /api/admin/audit-logs
interface AuditLogQuery {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  action?: AuditAction[];
  resourceType?: string[];
  page?: number;
  limit?: number;
}

interface AuditLogResponse {
  logs: AuditLogEntry[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

// POST /api/admin/audit-logs/export
// Returns CSV download
interface ExportRequest {
  filters: AuditLogQuery;
  format: 'csv' | 'json';
}
```

#### 4. Performance Metrics

```typescript
// GET /api/admin/clinician-metrics
interface ClinicianMetricsQuery {
  clinicianId?: string;  // Specific clinician or all
  period: 'day' | 'week' | 'month' | 'quarter';
  startDate?: Date;
  endDate?: Date;
}

interface ClinicianMetricsResponse {
  metrics: ClinicianMetrics[];
  aggregated: {
    totalRecordings: number;
    avgQualityScore: number;
    topPerformers: { clinicianId: string; score: number }[];
  };
}
```

#### 5. Content Moderation

```typescript
// GET /api/admin/recordings/flagged
interface FlaggedRecordingsQuery {
  severity?: 'low' | 'medium' | 'high';
  flagType?: string[];
  page?: number;
  limit?: number;
}

// POST /api/admin/recordings/:id/moderate
interface ModerationAction {
  action: 'approve' | 'reject' | 'request_resubmission' | 'delete';
  reason?: string;
  notifyClinician: boolean;
}
```

---

## 📦 Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Goal**: Setup Ant Design, enhance existing user management

**Tasks:**
1. Install Ant Design + dependencies
```bash
npm install antd @ant-design/icons @ant-design/charts dayjs
```

2. Configure Ant Design theme
```typescript
// src/theme/antd-theme.ts
export const antdTheme = {
  token: {
    colorPrimary: '#1677ff',
    borderRadius: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto',
  },
  components: {
    Table: {
      headerBg: '#fafafa',
      rowHoverBg: '#f5f5f5',
    },
    Card: {
      borderRadiusLG: 12,
    }
  }
};
```

3. Migrate UserManagementPanel to Ant Design
   - Replace existing table with `antd Table`
   - Add filters, sorting, pagination
   - Implement bulk actions with `rowSelection`

4. Create PendingApprovalsTab
   - List view with user cards
   - Approve/reject buttons
   - Admin notes textarea

**Deliverable**: Enhanced user management with Ant Design components

---

### Phase 2: Self-Registration (Week 3)
**Goal**: Add registration form to login page

**Tasks:**
1. Backend: Create registration endpoints
   - POST `/api/auth/register`
   - POST `/api/auth/verify-email`
   - Update User model with `emailVerified`, `credentials` fields

2. Frontend: Build RegistrationWizard
   - Multi-step form with Steps component
   - Validation for each step
   - Email verification flow

3. Email service integration
   - Verification emails (SendGrid/AWS SES)
   - Admin notification emails
   - Approval/rejection templates

4. Login page redesign
   - Two-column layout
   - Tabs for Sign In / Create Account
   - Branding section with feature list

**Deliverable**: Working self-registration with email verification

---

### Phase 3: Real-Time Monitoring (Week 4)
**Goal**: Add live activity dashboard

**Tasks:**
1. Backend: WebSocket setup
   - Install `socket.io`
   - Emit events for user actions
   - Admin-only room for activity feed

2. Frontend: ActivityMonitor component
   - WebSocket connection
   - Live activity timeline
   - Auto-scroll, filtering

3. SystemHealthWidget
   - Poll `/api/admin/system-health` every 30s
   - Gauges for CPU/memory/storage
   - Alert banners for critical status

4. Dashboard layout redesign
   - Grid layout with responsive cards
   - Quick stats cards (total users, recordings, etc.)
   - Alerts center (critical items at top)

**Deliverable**: Real-time monitoring dashboard

---

### Phase 4: Audit Logs (Week 5)
**Goal**: Comprehensive audit trail

**Tasks:**
1. Backend: Audit logging middleware
   - Intercept all write operations
   - Log to separate `audit_logs` table
   - Include IP, user agent, changes

2. Frontend: AuditLogViewer
   - Table with virtual scrolling
   - Advanced filters (date range, user, action)
   - Drawer for detailed log view
   - CSV export button

3. Retention policy settings
   - Admin configurable retention period
   - Auto-delete old logs
   - Archive to S3 option

**Deliverable**: Full audit logging system

---

### Phase 5: Performance Metrics (Week 6)
**Goal**: Clinician analytics

**Tasks:**
1. Backend: Metrics aggregation
   - Calculate performance stats
   - Cache results in Redis
   - Schedule daily rollups

2. Frontend: PerformanceMetrics page
   - Leaderboard table
   - Trend charts (@ant-design/charts)
   - Individual clinician drill-down

3. Data visualization
   - Line charts for productivity trends
   - Bar charts for quality scores
   - Heatmap for activity patterns

**Deliverable**: Analytics dashboard for clinician performance

---

### Phase 6: Content Moderation (Week 7-8)
**Goal**: Recording review workflow

**Tasks:**
1. Backend: Flagging system
   - Auto-flag recordings (quality checks)
   - Manual flag API
   - Moderation actions endpoint

2. Frontend: RecordingReviewQueue
   - Grid of flagged recordings
   - Filter by severity, type
   - Video player modal with approve/reject

3. Notification system
   - Notify clinicians when rejected
   - Request resubmission workflow
   - Admin alerts for high-severity flags

**Deliverable**: Content moderation tools

---

## 📊 Success Metrics

### User Experience
- [ ] Admin task completion time reduced by 50%
- [ ] User approval workflow: <2 minutes per user
- [ ] Zero-learning-curve for new admins (intuitive UI)

### System Performance
- [ ] Real-time updates: <500ms latency
- [ ] Audit log query: <1s for 10k records
- [ ] Dashboard load time: <2s

### Business Metrics
- [ ] User registration completion rate: >80%
- [ ] Admin approval turnaround: <24 hours
- [ ] Clinician productivity tracking: 100% coverage

---

## 🔒 Security Considerations

### Access Control
- Admin-only routes protected by `requireAdmin` middleware
- WebSocket rooms restricted to admin users
- Audit logs write-only (no edit/delete)

### Data Privacy
- Mask patient PII in audit logs
- Rate limit registration endpoint (5 attempts/hour)
- CAPTCHA on registration form to prevent bots

### Compliance
- HIPAA audit trail: all PHI access logged
- Data retention: configurable, default 90 days
- Encryption at rest for sensitive credentials

---

## 🎓 Development Guidelines

### Code Quality
- TypeScript strict mode enabled
- ESLint + Prettier for consistency
- Component tests with React Testing Library
- E2E tests for critical flows (Playwright)

### Performance
- Lazy load admin routes (code splitting)
- Virtual scrolling for large tables
- Debounce search inputs (300ms)
- Memoize expensive computations

### Accessibility
- WCAG 2.1 AA compliance
- Keyboard navigation for all actions
- Screen reader friendly (ARIA labels)
- Color contrast: 4.5:1 minimum

---

## 📚 Documentation Requirements

1. **Admin User Guide**
   - How to approve users
   - Understanding audit logs
   - Interpreting metrics

2. **API Documentation**
   - OpenAPI/Swagger spec
   - Example requests/responses
   - Authentication flow

3. **Component Storybook**
   - All UI components documented
   - Interactive examples
   - Props API reference

---

## ✅ Definition of Done

A feature is considered complete when:

- [ ] Code implemented and reviewed
- [ ] Unit tests written (>80% coverage)
- [ ] E2E test for happy path
- [ ] Responsive design (mobile, tablet, desktop)
- [ ] Accessibility audit passed
- [ ] Documentation updated
- [ ] Admin user guide section added
- [ ] Deployed to staging and tested
- [ ] Product owner approval

---

**Next Steps:**

1. Review this requirements document
2. Clarify any ambiguities
3. Prioritize features (if different from proposed phases)
4. Begin Phase 1 implementation

Would you like to proceed with implementation, or would you like to adjust any requirements first?
