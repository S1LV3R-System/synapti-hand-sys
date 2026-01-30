import React, { useState, useEffect } from 'react';
import {
  Drawer,
  Descriptions,
  Space,
  Tag,
  Button,
  Timeline,
  Typography,
  Badge,
  Card,
  Form,
  Input,
  Select,
  Spin,
  Empty,
  Alert,
  DatePicker,
  Divider,
  Modal,
  Table,
  Tooltip,
  message,
} from 'antd';
import dayjs from 'dayjs';
import {
  UserOutlined,
  MailOutlined,
  IdcardOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  MessageOutlined,
  InfoCircleOutlined,
  LockOutlined,
  UnlockOutlined,
  PhoneOutlined,
  CalendarOutlined,
  DeleteOutlined,
  KeyOutlined,
  PlusOutlined,
  CopyOutlined,
  ExclamationCircleOutlined,
  StopOutlined,
  CrownOutlined,
} from '@ant-design/icons';
import type { AdminNote } from '../../../types/admin.types';
import {
  useUser,
  useUserNotes,
  useAddAdminNote,
  useToggleUserStatus,
  useApproveUser,
  useRejectUser,
  useRequestMoreInfo,
  useSetAccountExpiration,
  useDeleteUser,
  useUserApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
  useDeleteApiKey,
  useUpdateUserRole,
} from '../../../hooks/useAdmin';
import { statusColors } from '../../../theme/antd-theme';
import type { ApiKey } from '../../../services';

const { Text, Title } = Typography;
const { TextArea } = Input;

interface UserDetailDrawerProps {
  userId: string | null;
  open: boolean;
  onClose: () => void;
}

export const UserDetailDrawer: React.FC<UserDetailDrawerProps> = ({
  userId,
  open,
  onClose,
}) => {
  const [noteForm] = Form.useForm();
  const [apiKeyForm] = Form.useForm();
  const [showAddNote, setShowAddNote] = useState(false);
  const [showApproveSection, setShowApproveSection] = useState(false);
  const [showRejectSection, setShowRejectSection] = useState(false);
  const [showRequestInfoSection, setShowRequestInfoSection] = useState(false);
  const [showExpirationSection, setShowExpirationSection] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCreateApiKey, setShowCreateApiKey] = useState(false);
  const [showRoleChangeSection, setShowRoleChangeSection] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [expirationDate, setExpirationDate] = useState<dayjs.Dayjs | null>(null);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  const { data: user, isLoading: isLoadingUser, refetch: refetchUser } = useUser(
    userId || '',
    !!userId
  );
  const { data: notes, isLoading: isLoadingNotes, refetch: refetchNotes } = useUserNotes(
    userId || '',
    true
  );
  const { data: apiKeys, isLoading: isLoadingApiKeys, refetch: refetchApiKeys } = useUserApiKeys(
    userId || '',
    !!userId
  );

  const addNote = useAddAdminNote();
  const toggleStatus = useToggleUserStatus();
  const approveUser = useApproveUser();
  const rejectUser = useRejectUser();
  const requestInfo = useRequestMoreInfo();
  const setExpiration = useSetAccountExpiration();
  const deleteUserMutation = useDeleteUser();
  const createApiKey = useCreateApiKey();
  const revokeApiKey = useRevokeApiKey();
  const deleteApiKey = useDeleteApiKey();
  const updateUserRole = useUpdateUserRole();

  // Reset forms when drawer opens/closes
  useEffect(() => {
    if (!open) {
      setShowAddNote(false);
      setShowApproveSection(false);
      setShowRejectSection(false);
      setShowRequestInfoSection(false);
      setShowExpirationSection(false);
      setShowDeleteConfirm(false);
      setShowCreateApiKey(false);
      setShowRoleChangeSection(false);
      setNewApiKey(null);
      setExpirationDate(null);
      setSelectedRole(null);
      noteForm.resetFields();
      apiKeyForm.resetFields();
    }
  }, [open, noteForm, apiKeyForm]);

  // Initialize expiration date when user data loads
  useEffect(() => {
    if (user?.accountExpiresAt) {
      setExpirationDate(dayjs(user.accountExpiresAt));
    } else {
      setExpirationDate(null);
    }
  }, [user?.accountExpiresAt]);

  // Handle add note
  const handleAddNote = async () => {
    try {
      const values = await noteForm.validateFields();
      await addNote.mutateAsync({
        userId: userId!,
        request: {
          content: values.content,
          isInternal: values.isInternal,
        },
      });
      noteForm.resetFields();
      setShowAddNote(false);
      refetchNotes();
      refetchUser();
    } catch (error) {
      console.error('Failed to add note:', error);
    }
  };

  // Handle approve user
  const handleApprove = async () => {
    try {
      const values = await noteForm.validateFields();
      await approveUser.mutateAsync({
        userId: userId!,
        request: { notes: values.approvalNotes },
      });
      setShowApproveSection(false);
      noteForm.resetFields();
      refetchUser();
      refetchNotes();
      onClose();
    } catch (error) {
      console.error('Failed to approve user:', error);
    }
  };

  // Handle reject user
  const handleReject = async () => {
    try {
      const values = await noteForm.validateFields();
      await rejectUser.mutateAsync({
        userId: userId!,
        request: {
          reason: values.rejectionReason,
          notes: values.rejectionNotes,
        },
      });
      setShowRejectSection(false);
      noteForm.resetFields();
      refetchUser();
      refetchNotes();
      onClose();
    } catch (error) {
      console.error('Failed to reject user:', error);
    }
  };

  // Handle request more info
  const handleRequestInfo = async () => {
    try {
      const values = await noteForm.validateFields();
      await requestInfo.mutateAsync({
        userId: userId!,
        request: {
          message: values.infoMessage,
          fields: values.infoFields,
        },
      });
      setShowRequestInfoSection(false);
      noteForm.resetFields();
      refetchNotes();
    } catch (error) {
      console.error('Failed to request info:', error);
    }
  };

  // Handle toggle status
  const handleToggleStatus = async () => {
    try {
      await toggleStatus.mutateAsync(userId!);
      refetchUser();
    } catch (error) {
      console.error('Failed to toggle status:', error);
    }
  };

  // Handle set expiration
  const handleSetExpiration = async () => {
    try {
      await setExpiration.mutateAsync({
        userId: userId!,
        expiresAt: expirationDate ? expirationDate.toISOString() : null,
      });
      setShowExpirationSection(false);
      refetchUser();
    } catch (error) {
      console.error('Failed to set expiration:', error);
    }
  };

  // Handle quick expiration presets
  const handleQuickExpiration = (months: number) => {
    const newDate = dayjs().add(months, 'month');
    setExpirationDate(newDate);
  };

  // Handle delete user
  const handleDeleteUser = async (permanent = false) => {
    try {
      await deleteUserMutation.mutateAsync({ id: userId!, permanent });
      message.success(permanent ? 'User permanently deleted' : 'User deleted successfully');
      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      console.error('Failed to delete user:', error);
    }
  };

  // Handle role change
  const handleRoleChange = async () => {
    if (!selectedRole || !userId) return;
    try {
      await updateUserRole.mutateAsync({ id: userId, data: { userType: selectedRole as 'Admin' | 'Clinician' | 'Researcher' } });
      message.success(`User role changed to ${selectedRole}`);
      setShowRoleChangeSection(false);
      setSelectedRole(null);
      refetchUser();
    } catch (error) {
      console.error('Failed to change role:', error);
      message.error('Failed to change user role');
    }
  };

  // Handle create API key
  const handleCreateApiKey = async () => {
    try {
      const values = await apiKeyForm.validateFields();
      const result = await createApiKey.mutateAsync({
        userId: userId!,
        name: values.keyName,
        permissions: values.permissions || 'read',
        expiresAt: values.keyExpires ? values.keyExpires.toISOString() : null,
      });
      setNewApiKey(result.key);
      apiKeyForm.resetFields();
      refetchApiKeys();
    } catch (error) {
      console.error('Failed to create API key:', error);
    }
  };

  // Handle revoke API key
  const handleRevokeApiKey = async (keyId: string) => {
    Modal.confirm({
      title: 'Revoke API Key',
      icon: <ExclamationCircleOutlined />,
      content: 'This will invalidate the API key. Applications using this key will no longer be able to authenticate.',
      okText: 'Revoke',
      okType: 'danger',
      onOk: async () => {
        await revokeApiKey.mutateAsync(keyId);
        refetchApiKeys();
      },
    });
  };

  // Handle delete API key
  const handleDeleteApiKey = async (keyId: string) => {
    Modal.confirm({
      title: 'Delete API Key',
      icon: <ExclamationCircleOutlined />,
      content: 'This will permanently delete the API key. This action cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        await deleteApiKey.mutateAsync(keyId);
        refetchApiKeys();
      },
    });
  };

  // Copy API key to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('API key copied to clipboard');
  };

  // Get approval status display
  const getApprovalStatusDisplay = () => {
    if (!user) return null;

    if (user.isApproved === null) {
      return (
        <Tag color={statusColors.pending} icon={<ClockCircleOutlined />} style={{ fontSize: 14 }}>
          Pending Approval
        </Tag>
      );
    } else if (user.isApproved === true) {
      return (
        <Tag color={statusColors.approved} icon={<CheckCircleOutlined />} style={{ fontSize: 14 }}>
          Approved
        </Tag>
      );
    } else {
      return (
        <Tag color={statusColors.rejected} icon={<CloseCircleOutlined />} style={{ fontSize: 14 }}>
          Rejected
        </Tag>
      );
    }
  };

  // Get note icon by type
  const getNoteIcon = (noteType: string) => {
    switch (noteType) {
      case 'approval':
        return <CheckCircleOutlined style={{ color: statusColors.approved }} />;
      case 'rejection':
        return <CloseCircleOutlined style={{ color: statusColors.rejected }} />;
      case 'info_request':
        return <InfoCircleOutlined style={{ color: '#0070f3' }} />;
      default:
        return <MessageOutlined style={{ color: '#666' }} />;
    }
  };

  if (!userId) return null;

  return (
    <Drawer
      title={
        <Space>
          <UserOutlined />
          <span>User Details</span>
        </Space>
      }
      placement="right"
      width={720}
      open={open}
      onClose={onClose}
      extra={
        <Space>
          <Button onClick={onClose}>Close</Button>
        </Space>
      }
    >
      {isLoadingUser ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
        </div>
      ) : !user ? (
        <Empty description="User not found" />
      ) : (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* User Info Header */}
          <Card>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <Space direction="vertical" size={4}>
                  <Title level={4} style={{ margin: 0 }}>
                    {user.fullName || `${user.firstName} ${user.lastName}`}
                  </Title>
                  <Space>
                    <Tag color="blue">{user.role}</Tag>
                    <Badge
                      status={user.isActive ? 'success' : 'default'}
                      text={user.isActive ? 'Active' : 'Inactive'}
                    />
                  </Space>
                </Space>
                {getApprovalStatusDisplay()}
              </div>

              <Descriptions bordered size="small" column={1}>
                <Descriptions.Item
                  label={
                    <Space>
                      <MailOutlined />
                      <span>Email</span>
                    </Space>
                  }
                >
                  <Space>
                    {user.email}
                    {user.emailVerified ? (
                      <Tag color="success" style={{ marginLeft: 8 }}>
                        Verified
                      </Tag>
                    ) : (
                      <Tag color="warning" style={{ marginLeft: 8 }}>
                        Unverified
                      </Tag>
                    )}
                  </Space>
                </Descriptions.Item>

                {user.phoneNumber && (
                  <Descriptions.Item
                    label={
                      <Space>
                        <PhoneOutlined />
                        <span>Phone</span>
                      </Space>
                    }
                  >
                    <a href={`tel:${user.phoneNumber}`} style={{ color: '#1890ff' }}>
                      {user.phoneNumber}
                    </a>
                  </Descriptions.Item>
                )}

                {user.hospital && (
                  <Descriptions.Item
                    label={
                      <Space>
                        <IdcardOutlined />
                        <span>Hospital</span>
                      </Space>
                    }
                  >
                    {user.hospital}
                  </Descriptions.Item>
                )}

                {user.department && (
                  <Descriptions.Item label="Department">{user.department}</Descriptions.Item>
                )}

                {user.licenseNumber && (
                  <Descriptions.Item label="License">
                    {user.licenseNumber}
                    {user.licenseState && ` (${user.licenseState})`}
                  </Descriptions.Item>
                )}

                {user.specialty && (
                  <Descriptions.Item label="Specialty">{user.specialty}</Descriptions.Item>
                )}

                <Descriptions.Item label="Registered">
                  {new Date(user.createdAt).toLocaleDateString()} at{' '}
                  {new Date(user.createdAt).toLocaleTimeString()}
                </Descriptions.Item>

                <Descriptions.Item label="Last Login">
                  {user.lastLogin
                    ? `${new Date(user.lastLogin).toLocaleDateString()} at ${new Date(
                        user.lastLogin
                      ).toLocaleTimeString()}`
                    : 'Never'}
                </Descriptions.Item>

                {user.registrationIp && (
                  <Descriptions.Item label="Registration IP">{user.registrationIp}</Descriptions.Item>
                )}

                {user.registrationDevice && (
                  <Descriptions.Item label="Device">{user.registrationDevice}</Descriptions.Item>
                )}

                <Descriptions.Item
                  label={
                    <Space>
                      <CalendarOutlined />
                      <span>Account Expires</span>
                    </Space>
                  }
                >
                  {user.accountExpiresAt ? (
                    <Space>
                      <span>{new Date(user.accountExpiresAt).toLocaleDateString()}</span>
                      {dayjs(user.accountExpiresAt).isBefore(dayjs()) ? (
                        <Tag color="error">Expired</Tag>
                      ) : dayjs(user.accountExpiresAt).isBefore(dayjs().add(30, 'day')) ? (
                        <Tag color="warning">Expiring Soon</Tag>
                      ) : (
                        <Tag color="success">Active</Tag>
                      )}
                    </Space>
                  ) : (
                    <Tag color="default">No Expiration</Tag>
                  )}
                </Descriptions.Item>
              </Descriptions>
            </Space>
          </Card>

          {/* Rejection Reason (if rejected) */}
          {user.isApproved === false && user.rejectionReason && (
            <Alert
              message="Rejection Reason"
              description={user.rejectionReason}
              type="error"
              showIcon
              icon={<CloseCircleOutlined />}
            />
          )}

          {/* Action Buttons */}
          <Card title="Actions" size="small">
            <Space wrap>
              {user.isApproved === null && (
                <>
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    onClick={() => setShowApproveSection(!showApproveSection)}
                  >
                    Approve User
                  </Button>
                  <Button
                    danger
                    icon={<CloseCircleOutlined />}
                    onClick={() => setShowRejectSection(!showRejectSection)}
                  >
                    Reject User
                  </Button>
                  <Button
                    icon={<InfoCircleOutlined />}
                    onClick={() => setShowRequestInfoSection(!showRequestInfoSection)}
                  >
                    Request Info
                  </Button>
                </>
              )}

              <Button
                icon={user.isActive ? <LockOutlined /> : <UnlockOutlined />}
                onClick={handleToggleStatus}
                loading={toggleStatus.isPending}
              >
                {user.isActive ? 'Deactivate' : 'Activate'}
              </Button>

              <Button icon={<MessageOutlined />} onClick={() => setShowAddNote(!showAddNote)}>
                Add Note
              </Button>

              <Button
                icon={<CalendarOutlined />}
                onClick={() => setShowExpirationSection(!showExpirationSection)}
              >
                Set Time Limit
              </Button>

              <Button
                icon={<KeyOutlined />}
                onClick={() => setShowCreateApiKey(!showCreateApiKey)}
              >
                Manage API Keys
              </Button>

              <Button
                icon={<CrownOutlined />}
                onClick={() => {
                  setShowRoleChangeSection(!showRoleChangeSection);
                  setSelectedRole(user.role);
                }}
              >
                Change Role
              </Button>

              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete User
              </Button>
            </Space>

            {/* Approve Section */}
            {showApproveSection && (
              <Card size="small" style={{ marginTop: 16, background: '#f0f8ff' }}>
                <Form form={noteForm} layout="vertical">
                  <Form.Item name="approvalNotes" label="Approval Notes (Optional)">
                    <TextArea
                      rows={3}
                      placeholder="Welcome message or approval notes..."
                      maxLength={500}
                      showCount
                    />
                  </Form.Item>
                  <Space>
                    <Button
                      type="primary"
                      icon={<CheckCircleOutlined />}
                      onClick={handleApprove}
                      loading={approveUser.isPending}
                    >
                      Confirm Approval
                    </Button>
                    <Button onClick={() => setShowApproveSection(false)}>Cancel</Button>
                  </Space>
                </Form>
              </Card>
            )}

            {/* Reject Section */}
            {showRejectSection && (
              <Card size="small" style={{ marginTop: 16, background: '#fff1f0' }}>
                <Form form={noteForm} layout="vertical">
                  <Form.Item
                    name="rejectionReason"
                    label="Rejection Reason (Required)"
                    rules={[
                      { required: true, message: 'Please provide a reason' },
                      { min: 10, message: 'Reason must be at least 10 characters' },
                    ]}
                  >
                    <TextArea
                      rows={3}
                      placeholder="Reason for rejection (will be sent to user)..."
                      maxLength={500}
                      showCount
                    />
                  </Form.Item>
                  <Form.Item name="rejectionNotes" label="Internal Notes (Optional)">
                    <TextArea
                      rows={2}
                      placeholder="Additional admin notes (internal only)..."
                      maxLength={500}
                      showCount
                    />
                  </Form.Item>
                  <Space>
                    <Button
                      danger
                      icon={<CloseCircleOutlined />}
                      onClick={handleReject}
                      loading={rejectUser.isPending}
                    >
                      Confirm Rejection
                    </Button>
                    <Button onClick={() => setShowRejectSection(false)}>Cancel</Button>
                  </Space>
                </Form>
              </Card>
            )}

            {/* Request Info Section */}
            {showRequestInfoSection && (
              <Card size="small" style={{ marginTop: 16, background: '#fffbe6' }}>
                <Form form={noteForm} layout="vertical">
                  <Form.Item
                    name="infoMessage"
                    label="Message to User"
                    rules={[
                      { required: true, message: 'Please provide a message' },
                      { min: 10, message: 'Message must be at least 10 characters' }
                    ]}
                  >
                    <TextArea
                      rows={3}
                      placeholder="What additional information do you need? (min 10 characters)"
                      maxLength={500}
                      showCount
                    />
                  </Form.Item>
                  <Form.Item name="infoFields" label="Specific Fields (Optional)">
                    <Select
                      mode="tags"
                      placeholder="e.g., license number, hospital affiliation..."
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                  <Space>
                    <Button
                      type="primary"
                      icon={<InfoCircleOutlined />}
                      onClick={handleRequestInfo}
                      loading={requestInfo.isPending}
                    >
                      Send Request
                    </Button>
                    <Button onClick={() => setShowRequestInfoSection(false)}>Cancel</Button>
                  </Space>
                </Form>
              </Card>
            )}

            {/* Add Note Section */}
            {showAddNote && (
              <Card size="small" style={{ marginTop: 16 }}>
                <Form form={noteForm} layout="vertical" initialValues={{ isInternal: true }}>
                  <Form.Item
                    name="content"
                    label="Note Content"
                    rules={[{ required: true, message: 'Please enter note content' }]}
                  >
                    <TextArea rows={3} maxLength={500} showCount />
                  </Form.Item>
                  <Form.Item name="isInternal" label="Visibility" initialValue={true}>
                    <Select
                      options={[
                        { label: 'Internal (Admin Only)', value: true },
                        { label: 'External (User Visible)', value: false },
                      ]}
                    />
                  </Form.Item>
                  <Space>
                    <Button
                      type="primary"
                      icon={<MessageOutlined />}
                      onClick={handleAddNote}
                      loading={addNote.isPending}
                    >
                      Add Note
                    </Button>
                    <Button onClick={() => setShowAddNote(false)}>Cancel</Button>
                  </Space>
                </Form>
              </Card>
            )}

            {/* Set Account Expiration Section */}
            {showExpirationSection && (
              <Card size="small" style={{ marginTop: 16, background: '#f5f5f5' }}>
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <Text strong>Set Account Time Limit</Text>
                  <Text type="secondary">
                    Set an expiration date for this user's account. After this date, the user will not be able to access the system.
                  </Text>

                  <Divider style={{ margin: '8px 0' }}>Quick Presets</Divider>
                  <Space wrap>
                    <Button size="small" onClick={() => handleQuickExpiration(1)}>1 Month</Button>
                    <Button size="small" onClick={() => handleQuickExpiration(3)}>3 Months</Button>
                    <Button size="small" onClick={() => handleQuickExpiration(6)}>6 Months</Button>
                    <Button size="small" onClick={() => handleQuickExpiration(12)}>1 Year</Button>
                    <Button size="small" type="dashed" onClick={() => setExpirationDate(null)}>No Expiration</Button>
                  </Space>

                  <Divider style={{ margin: '8px 0' }}>Or Choose Date</Divider>
                  <DatePicker
                    value={expirationDate}
                    onChange={(date) => setExpirationDate(date)}
                    style={{ width: '100%' }}
                    placeholder="Select expiration date"
                    disabledDate={(current) => current && current < dayjs().startOf('day')}
                    showTime={false}
                    format="MMMM D, YYYY"
                  />

                  {expirationDate && (
                    <Alert
                      message={`Account will expire on ${expirationDate.format('MMMM D, YYYY')}`}
                      description={`This is approximately ${expirationDate.diff(dayjs(), 'day')} days from now.`}
                      type="info"
                      showIcon
                    />
                  )}

                  <Space style={{ marginTop: 8 }}>
                    <Button
                      type="primary"
                      icon={<CalendarOutlined />}
                      onClick={handleSetExpiration}
                      loading={setExpiration.isPending}
                    >
                      {expirationDate ? 'Set Expiration' : 'Remove Expiration'}
                    </Button>
                    <Button onClick={() => setShowExpirationSection(false)}>Cancel</Button>
                  </Space>
                </Space>
              </Card>
            )}

            {/* Delete User Confirmation */}
            {showDeleteConfirm && (
              <Card size="small" style={{ marginTop: 16, background: '#fff1f0' }}>
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <Alert
                    message="Delete User"
                    description={
                      <>
                        <p>Are you sure you want to delete <strong>{user?.fullName || user?.email}</strong>?</p>
                        <p>• <strong>Soft Delete:</strong> User will be marked as deleted but data is preserved.</p>
                        <p>• <strong>Permanent Delete:</strong> All user data will be permanently removed.</p>
                      </>
                    }
                    type="error"
                    showIcon
                    icon={<ExclamationCircleOutlined />}
                  />
                  <Space>
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleDeleteUser(false)}
                      loading={deleteUserMutation.isPending}
                    >
                      Soft Delete
                    </Button>
                    <Button
                      danger
                      type="primary"
                      icon={<DeleteOutlined />}
                      onClick={() => handleDeleteUser(true)}
                      loading={deleteUserMutation.isPending}
                    >
                      Permanent Delete
                    </Button>
                    <Button onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                  </Space>
                </Space>
              </Card>
            )}

            {/* Role Change Section */}
            {showRoleChangeSection && (
              <Card size="small" style={{ marginTop: 16, background: '#f6ffed' }}>
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <Text strong>
                    <CrownOutlined style={{ marginRight: 8 }} />
                    Change User Role
                  </Text>
                  <Text type="secondary">
                    Current role: <Tag color="blue">{user.role}</Tag>
                  </Text>
                  <Select
                    value={selectedRole}
                    onChange={(value) => setSelectedRole(value)}
                    style={{ width: '100%' }}
                    options={[
                      { label: 'Admin - Full system access', value: 'admin' },
                      { label: 'Clinician - Clinical data access', value: 'clinician' },
                      { label: 'Patient - Patient access', value: 'patient' },
                      { label: 'Researcher - Research access', value: 'researcher' },
                    ]}
                  />
                  {selectedRole && selectedRole !== user.role && (
                    <Alert
                      message={`Role will change from "${user.role}" to "${selectedRole}"`}
                      description={
                        selectedRole === 'admin'
                          ? 'Warning: Admin users have full system access including user management.'
                          : selectedRole === 'clinician'
                          ? 'Clinicians can access clinical data and patient records. They can view protocols but cannot create them or access comparisons.'
                          : selectedRole === 'researcher'
                          ? 'Researchers can access comparisons, create custom protocols, and perform research analysis.'
                          : 'Patients have limited access to view their own data.'
                      }
                      type={selectedRole === 'admin' ? 'warning' : 'info'}
                      showIcon
                    />
                  )}
                  <Space>
                    <Button
                      type="primary"
                      icon={<CrownOutlined />}
                      onClick={handleRoleChange}
                      loading={updateUserRole.isPending}
                      disabled={!selectedRole || selectedRole === user.role}
                    >
                      Update Role
                    </Button>
                    <Button onClick={() => {
                      setShowRoleChangeSection(false);
                      setSelectedRole(null);
                    }}>
                      Cancel
                    </Button>
                  </Space>
                </Space>
              </Card>
            )}
          </Card>

          {/* API Key Management Section */}
          {showCreateApiKey && (
            <Card
              title={
                <Space>
                  <KeyOutlined />
                  <span>API Key Management</span>
                  <Badge count={apiKeys?.length || 0} showZero style={{ backgroundColor: '#0070f3' }} />
                </Space>
              }
              size="small"
              extra={
                <Button
                  type="primary"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => setNewApiKey(null)}
                >
                  New Key
                </Button>
              }
            >
              {/* New API Key Created Alert */}
              {newApiKey && (
                <Alert
                  message="API Key Created Successfully"
                  description={
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Text type="warning" strong>
                        Copy this key now - it won't be shown again!
                      </Text>
                      <div style={{ background: '#f5f5f5', padding: '8px 12px', borderRadius: 4 }}>
                        <code style={{ wordBreak: 'break-all' }}>{newApiKey}</code>
                      </div>
                      <Button
                        type="primary"
                        icon={<CopyOutlined />}
                        onClick={() => copyToClipboard(newApiKey)}
                      >
                        Copy to Clipboard
                      </Button>
                    </Space>
                  }
                  type="success"
                  showIcon
                  closable
                  onClose={() => setNewApiKey(null)}
                  style={{ marginBottom: 16 }}
                />
              )}

              {/* Create New API Key Form */}
              {!newApiKey && (
                <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
                  <Form form={apiKeyForm} layout="vertical">
                    <Form.Item
                      name="keyName"
                      label="Key Name"
                      rules={[{ required: true, message: 'Please enter a name for this API key' }]}
                    >
                      <Input placeholder="e.g., Production API, Development, Mobile App" />
                    </Form.Item>
                    <Form.Item name="permissions" label="Permissions" initialValue="read">
                      <Select
                        options={[
                          { label: 'Read Only', value: 'read' },
                          { label: 'Read & Write', value: 'write' },
                          { label: 'Admin (Full Access)', value: 'admin' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name="keyExpires" label="Expiration (Optional)">
                      <DatePicker
                        style={{ width: '100%' }}
                        placeholder="Never expires"
                        disabledDate={(current) => current && current < dayjs().startOf('day')}
                      />
                    </Form.Item>
                    <Button
                      type="primary"
                      icon={<KeyOutlined />}
                      onClick={handleCreateApiKey}
                      loading={createApiKey.isPending}
                    >
                      Generate API Key
                    </Button>
                  </Form>
                </Card>
              )}

              {/* Existing API Keys Table */}
              {isLoadingApiKeys ? (
                <Spin />
              ) : !apiKeys || apiKeys.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No API keys created yet"
                />
              ) : (
                <Table
                  dataSource={apiKeys}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  columns={[
                    {
                      title: 'Name',
                      dataIndex: 'name',
                      key: 'name',
                      render: (name: string, record: ApiKey) => (
                        <Space direction="vertical" size={0}>
                          <Text strong>{name}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>{record.keyPrefix}...</Text>
                        </Space>
                      ),
                    },
                    {
                      title: 'Permissions',
                      dataIndex: 'permissions',
                      key: 'permissions',
                      render: (permissions: string) => (
                        <Tag color={
                          permissions === 'admin' ? 'purple' :
                          permissions === 'write' ? 'blue' : 'green'
                        }>
                          {permissions}
                        </Tag>
                      ),
                    },
                    {
                      title: 'Status',
                      key: 'status',
                      render: (_: any, record: ApiKey) => {
                        if (!record.isActive || record.revokedAt) {
                          return <Tag color="error">Revoked</Tag>;
                        }
                        if (record.expiresAt && dayjs(record.expiresAt).isBefore(dayjs())) {
                          return <Tag color="warning">Expired</Tag>;
                        }
                        return <Tag color="success">Active</Tag>;
                      },
                    },
                    {
                      title: 'Usage',
                      dataIndex: 'usageCount',
                      key: 'usageCount',
                      render: (count: number, record: ApiKey) => (
                        <Tooltip title={record.lastUsedAt ? `Last used: ${new Date(record.lastUsedAt).toLocaleString()}` : 'Never used'}>
                          <span>{count} calls</span>
                        </Tooltip>
                      ),
                    },
                    {
                      title: 'Actions',
                      key: 'actions',
                      render: (_: any, record: ApiKey) => (
                        <Space size="small">
                          {record.isActive && !record.revokedAt && (
                            <Tooltip title="Revoke">
                              <Button
                                type="text"
                                size="small"
                                danger
                                icon={<StopOutlined />}
                                onClick={() => handleRevokeApiKey(record.id)}
                              />
                            </Tooltip>
                          )}
                          <Tooltip title="Delete">
                            <Button
                              type="text"
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => handleDeleteApiKey(record.id)}
                            />
                          </Tooltip>
                        </Space>
                      ),
                    },
                  ]}
                />
              )}
            </Card>
          )}

          {/* Admin Notes Timeline */}
          <Card
            title={
              <Space>
                <MessageOutlined />
                <span>Admin Notes & History</span>
                <Badge count={notes?.length || 0} showZero style={{ backgroundColor: '#0070f3' }} />
              </Space>
            }
            size="small"
          >
            {isLoadingNotes ? (
              <Spin />
            ) : !notes || notes.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No notes yet"
                style={{ padding: '20px 0' }}
              />
            ) : (
              <Timeline
                items={notes?.map((note: AdminNote) => ({
                  dot: getNoteIcon(note.noteType),
                  children: (
                    <Card size="small" style={{ marginBottom: 8 }}>
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Space>
                            <Text strong>{note.admin.fullName || note.admin.email}</Text>
                            <Tag style={{ textTransform: 'capitalize' }}>
                              {note.noteType.replace('_', ' ')}
                            </Tag>
                            {note.isInternal && (
                              <Tag color="orange">Internal</Tag>
                            )}
                          </Space>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {new Date(note.createdAt).toLocaleString()}
                          </Text>
                        </div>
                        <Text>{note.content}</Text>
                      </Space>
                    </Card>
                  ),
                }))}
              />
            )}
          </Card>
        </Space>
      )}
    </Drawer>
  );
};
