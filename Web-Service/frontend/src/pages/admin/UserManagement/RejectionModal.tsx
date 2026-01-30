import React, { useState } from 'react';
import { Modal, Form, Input, Space, Typography, Descriptions, Tag, Alert } from 'antd';
import { CloseCircleOutlined, UserOutlined, MailOutlined } from '@ant-design/icons';
import type { PendingUser } from '../../../types/admin.types';
import { useRejectUser } from '../../../hooks/useAdmin';
import { statusColors } from '../../../theme/antd-theme';

const { TextArea } = Input;
const { Text } = Typography;

interface RejectionModalProps {
  open: boolean;
  user: PendingUser | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export const RejectionModal: React.FC<RejectionModalProps> = ({
  open,
  user,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const rejectUser = useRejectUser();

  const handleReject = async () => {
    if (!user) return;

    try {
      const values = await form.validateFields();
      setLoading(true);

      await rejectUser.mutateAsync({
        userId: user.id,
        request: {
          reason: values.reason,
          notes: values.notes || undefined,
        },
      });

      form.resetFields();
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Rejection failed:', error);
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
          <CloseCircleOutlined style={{ color: statusColors.rejected }} />
          <span>Reject User Registration</span>
        </Space>
      }
      onOk={handleReject}
      onCancel={handleCancel}
      okText="Reject User"
      cancelText="Cancel"
      confirmLoading={loading}
      width={600}
      okButtonProps={{
        icon: <CloseCircleOutlined />,
        danger: true,
      }}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* User Summary */}
        <Descriptions
          bordered
          size="small"
          column={1}
          labelStyle={{ width: '120px', fontWeight: 500 }}
        >
          <Descriptions.Item
            label={
              <Space>
                <UserOutlined />
                <span>Name</span>
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
        </Descriptions>

        {/* Rejection Form */}
        <Form form={form} layout="vertical">
          <Form.Item
            name="reason"
            label="Rejection Reason"
            rules={[
              { required: true, message: 'Please provide a rejection reason' },
              { min: 10, message: 'Reason must be at least 10 characters' },
            ]}
            help="This reason will be sent to the user via email"
          >
            <TextArea
              rows={3}
              placeholder="e.g., Unable to verify medical license number with state database"
              maxLength={500}
              showCount
            />
          </Form.Item>

          <Form.Item
            name="notes"
            label="Additional Internal Notes (Optional)"
            help="These notes are for admin reference only and will NOT be sent to the user"
          >
            <TextArea
              rows={2}
              placeholder="e.g., Contacted applicant for clarification, no response received"
              maxLength={500}
              showCount
            />
          </Form.Item>
        </Form>

        {/* Warning */}
        <Alert
          message="Important"
          description={
            <div>
              <Text>
                Rejecting this user will:
                <ul style={{ marginTop: '8px', marginBottom: '0' }}>
                  <li>Prevent them from accessing the SynaptiHand platform</li>
                  <li>Send them an email with the rejection reason</li>
                  <li>Mark their account as rejected in the system</li>
                </ul>
              </Text>
              <Text type="secondary" style={{ fontSize: '12px', marginTop: '8px', display: 'block' }}>
                Note: Users can appeal rejection by contacting support. Their account can be
                reactivated by changing the approval status.
              </Text>
            </div>
          }
          type="warning"
          showIcon
        />
      </Space>
    </Modal>
  );
};
