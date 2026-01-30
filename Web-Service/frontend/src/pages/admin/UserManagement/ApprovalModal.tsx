import React, { useState } from 'react';
import { Modal, Form, Input, Space, Typography, Descriptions, Tag } from 'antd';
import { CheckCircleOutlined, UserOutlined, MailOutlined, IdcardOutlined } from '@ant-design/icons';
import type { PendingUser } from '../../../types/admin.types';
import { useApproveUser } from '../../../hooks/useAdmin';
import { statusColors } from '../../../theme/antd-theme';

const { TextArea } = Input;
const { Text } = Typography;

interface ApprovalModalProps {
  open: boolean;
  user: PendingUser | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ApprovalModal: React.FC<ApprovalModalProps> = ({
  open,
  user,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const approveUser = useApproveUser();

  const handleApprove = async () => {
    if (!user) return;

    try {
      const values = await form.validateFields();
      setLoading(true);

      await approveUser.mutateAsync({
        userId: user.id,
        request: {
          notes: values.notes || undefined,
        },
      });

      form.resetFields();
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Approval failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onClose();
  };

  if (!user) return null;

  return (
    <Modal
      open={open}
      title={
        <Space>
          <CheckCircleOutlined style={{ color: statusColors.approved }} />
          <span>Approve User Registration</span>
        </Space>
      }
      onOk={handleApprove}
      onCancel={handleCancel}
      okText="Approve User"
      cancelText="Cancel"
      confirmLoading={loading}
      width={600}
      okButtonProps={{
        icon: <CheckCircleOutlined />,
      }}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* User Summary */}
        <Descriptions
          bordered
          size="small"
          column={1}
          labelStyle={{ width: '140px', fontWeight: 500 }}
        >
          <Descriptions.Item
            label={
              <Space>
                <UserOutlined />
                <span>Full Name</span>
              </Space>
            }
          >
            {user.fullName || `${user.firstName} ${user.lastName}`}
          </Descriptions.Item>

          <Descriptions.Item
            label={
              <Space>
                <MailOutlined />
                <span>Email</span>
              </Space>
            }
          >
            {user.email}
          </Descriptions.Item>

          <Descriptions.Item label="Role">
            <Tag color="blue">{user.role}</Tag>
          </Descriptions.Item>

          {user.hospital && (
            <Descriptions.Item label="Hospital">
              {user.hospital}
            </Descriptions.Item>
          )}

          {user.department && (
            <Descriptions.Item label="Department">
              {user.department}
            </Descriptions.Item>
          )}

          {user.licenseNumber && (
            <Descriptions.Item
              label={
                <Space>
                  <IdcardOutlined />
                  <span>License</span>
                </Space>
              }
            >
              {user.licenseNumber}
              {user.licenseState && ` (${user.licenseState})`}
            </Descriptions.Item>
          )}

          <Descriptions.Item label="Email Verified">
            <Tag color={user.emailVerified ? 'success' : 'warning'}>
              {user.emailVerified ? 'Verified' : 'Not Verified'}
            </Tag>
          </Descriptions.Item>

          <Descriptions.Item label="Registered">
            {new Date(user.createdAt).toLocaleDateString()} at{' '}
            {new Date(user.createdAt).toLocaleTimeString()}
          </Descriptions.Item>
        </Descriptions>

        {/* Approval Notes */}
        <Form form={form} layout="vertical">
          <Form.Item
            name="notes"
            label="Approval Notes (Optional)"
            help="These notes will be visible to the user in their approval email"
          >
            <TextArea
              rows={3}
              placeholder="e.g., Welcome to SynaptiHand! Your credentials have been verified."
              maxLength={500}
              showCount
            />
          </Form.Item>
        </Form>

        {/* Warning */}
        <div
          style={{
            padding: '12px 16px',
            background: '#f0f8ff',
            border: '1px solid #d6ebff',
            borderRadius: '8px',
          }}
        >
          <Text type="secondary" style={{ fontSize: '13px' }}>
            <strong>Action:</strong> Approving this user will grant them access to the SynaptiHand
            platform. They will receive an email notification and can immediately log in.
          </Text>
        </div>
      </Space>
    </Modal>
  );
};
