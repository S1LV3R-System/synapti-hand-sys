import React, { useState } from 'react';
import {
  Table,
  Button,
  Input,
  Select,
  Space,
  Tag,
  Modal,
  message,
  Tooltip,
  Dropdown,
  Card,
  Typography,
  Row,
  Col,
  Statistic,
  Empty
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  MoreOutlined,
  ReloadOutlined,
  CopyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import { useProtocols, useDeleteProtocol, useUpdateProtocol } from '../../hooks/useProtocols';
import { useCurrentUser } from '../../hooks/useAuth';
import { isAdmin, isResearcherOrAdmin, protocolPermissions } from '../../utils/permissions';
import type { Protocol, ProtocolFilters } from '../../types/api.types';
import ProtocolFormModal from './ProtocolFormModal';
import ProtocolDetailDrawer from './ProtocolDetailDrawer';
import { systemService } from '../../services';

const { Title, Text } = Typography;
const { Option } = Select;

export const ProtocolsList: React.FC = () => {
  const { data: currentUser } = useCurrentUser();
  
  // State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<ProtocolFilters>({
    search: '',
    isActive: undefined,
    isPublic: undefined,
  });
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [protocolToDelete, setProtocolToDelete] = useState<Protocol | null>(null);
  const [hardDeleteModalOpen, setHardDeleteModalOpen] = useState(false);
  const [hardDeleting, setHardDeleting] = useState(false);

  // Data fetching
  const { data, isLoading, refetch } = useProtocols({
    page,
    limit: pageSize,
    ...filters,
  });

  const deleteProtocol = useDeleteProtocol();
  const updateProtocol = useUpdateProtocol();

  // Handlers
  const handleSearch = (value: string) => {
    setFilters(prev => ({ ...prev, search: value }));
    setPage(1);
  };

  const handleFilterChange = (key: keyof ProtocolFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleEdit = (protocol: Protocol) => {
    setSelectedProtocol(protocol);
    setEditModalOpen(true);
  };

  const handleView = (protocol: Protocol) => {
    setSelectedProtocol(protocol);
    setDetailDrawerOpen(true);
  };

  const handleDeleteClick = (protocol: Protocol) => {
    setProtocolToDelete(protocol);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!protocolToDelete) return;
    
    try {
      await deleteProtocol.mutateAsync({ id: protocolToDelete.id });
      message.success('Protocol soft-deleted successfully (will be permanently deleted in 15 days)');
      setDeleteModalOpen(false);
      setProtocolToDelete(null);
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Failed to delete protocol');
    }
  };

  const handleHardDeleteClick = (protocol: Protocol) => {
    setProtocolToDelete(protocol);
    setHardDeleteModalOpen(true);
  };

  const handleHardDeleteConfirm = async () => {
    if (!protocolToDelete) return;
    
    setHardDeleting(true);
    try {
      await systemService.hardDeleteProtocol(protocolToDelete.id);
      message.success('Protocol permanently deleted');
      setHardDeleteModalOpen(false);
      setProtocolToDelete(null);
      refetch(); // Refresh the list
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Failed to hard-delete protocol');
    } finally {
      setHardDeleting(false);
    }
  };

  const handleToggleActive = async (protocol: Protocol) => {
    try {
      await updateProtocol.mutateAsync({
        id: protocol.id,
        data: { isActive: !protocol.isActive }
      });
      message.success(`Protocol ${protocol.isActive ? 'deactivated' : 'activated'} successfully`);
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Failed to update protocol');
    }
  };

  const handleDuplicate = async (protocol: Protocol) => {
    setSelectedProtocol({
      ...protocol,
      id: '',
      name: `${protocol.name} (Copy)`,
    } as Protocol);
    setCreateModalOpen(true);
  };

  const handleBulkDelete = async () => {
    Modal.confirm({
      title: `Delete ${selectedRowKeys.length} protocols?`,
      content: 'This action cannot be undone. Protocols with associated recordings cannot be deleted.',
      okText: 'Delete All',
      okType: 'danger',
      onOk: async () => {
        let successCount = 0;
        let failCount = 0;
        
        for (const id of selectedRowKeys) {
          try {
            await deleteProtocol.mutateAsync({ id: id as string });
            successCount++;
          } catch {
            failCount++;
          }
        }
        
        if (successCount > 0) {
          message.success(`Deleted ${successCount} protocol(s)`);
        }
        if (failCount > 0) {
          message.warning(`Failed to delete ${failCount} protocol(s)`);
        }
        setSelectedRowKeys([]);
      },
    });
  };

  const handleBulkToggleActive = async (activate: boolean) => {
    let successCount = 0;
    
    for (const id of selectedRowKeys) {
      try {
        await updateProtocol.mutateAsync({
          id: id as string,
          data: { isActive: activate }
        });
        successCount++;
      } catch {
        // Continue with others
      }
    }
    
    message.success(`${activate ? 'Activated' : 'Deactivated'} ${successCount} protocol(s)`);
    setSelectedRowKeys([]);
  };

  // Row actions menu
  const getRowActions = (protocol: Protocol): MenuProps['items'] => [
    {
      key: 'view',
      icon: <EyeOutlined />,
      label: 'View Details',
      onClick: () => handleView(protocol),
    },
    {
      key: 'edit',
      icon: <EditOutlined />,
      label: 'Edit',
      onClick: () => handleEdit(protocol),
      disabled: !protocolPermissions.canEdit(currentUser, protocol.createdById),
    },
    {
      key: 'duplicate',
      icon: <CopyOutlined />,
      label: 'Duplicate',
      onClick: () => handleDuplicate(protocol),
      disabled: !protocolPermissions.canCreate(currentUser),
    },
    { type: 'divider' },
    {
      key: 'toggle',
      icon: protocol.isActive ? <CloseCircleOutlined /> : <CheckCircleOutlined />,
      label: protocol.isActive ? 'Deactivate' : 'Activate',
      onClick: () => handleToggleActive(protocol),
      disabled: !protocolPermissions.canEdit(currentUser, protocol.createdById),
    },
    { type: 'divider' },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: 'Soft Delete (15 days)',
      danger: true,
      onClick: () => handleDeleteClick(protocol),
      disabled: !isAdmin(currentUser),
    },
    ...(isAdmin(currentUser) ? [{
      key: 'hard-delete',
      icon: <DeleteOutlined style={{ color: '#ff0000' }} />,
      label: 'Hard Delete (Permanent)',
      danger: true,
      onClick: () => handleHardDeleteClick(protocol),
    }] : []),
  ];

  // Table columns
  const columns: ColumnsType<Protocol> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space direction="vertical" size={0}>
          <Text strong className="text-blue-600 cursor-pointer hover:underline" onClick={() => handleView(record)}>
            {text}
          </Text>
          {record.description && (
            <Text type="secondary" className="text-xs" ellipsis={{ tooltip: record.description }}>
              {record.description.length > 60 ? `${record.description.substring(0, 60)}...` : record.description}
            </Text>
          )}
        </Space>
      ),
      sorter: true,
    },
    {
      title: 'Version',
      dataIndex: 'version',
      key: 'version',
      width: 100,
      render: (text) => <Tag>{text || '1.0'}</Tag>,
    },
    {
      title: 'Status',
      key: 'status',
      width: 120,
      render: (_, record) => (
        <Space>
          <Tag color={record.isActive ? 'success' : 'default'}>
            {record.isActive ? 'Active' : 'Inactive'}
          </Tag>
        </Space>
      ),
      filters: [
        { text: 'Active', value: true },
        { text: 'Inactive', value: false },
      ],
    },
    {
      title: 'Visibility',
      key: 'visibility',
      width: 100,
      render: (_, record) => (
        <Tag color={record.isPublic ? 'blue' : 'orange'}>
          {record.isPublic ? 'Public' : 'Private'}
        </Tag>
      ),
    },
    {
      title: 'Created By',
      dataIndex: 'createdBy',
      key: 'createdBy',
      width: 150,
      render: (user) => user?.email || '-',
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 120,
      render: (date) => new Date(date).toLocaleDateString(),
      sorter: true,
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      fixed: 'right',
      render: (_, record) => (
        <Dropdown menu={{ items: getRowActions(record) }} trigger={['click']}>
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  // Row selection config
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
    selections: [
      Table.SELECTION_ALL,
      Table.SELECTION_INVERT,
      Table.SELECTION_NONE,
    ],
  };

  const protocols = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-start">
          <div>
            <Title level={2} className="!mb-1">
              <FileTextOutlined className="mr-2" />
              Protocols
            </Title>
            <Text type="secondary">
              Manage assessment protocols and clinical procedures
            </Text>
          </div>
          {protocolPermissions.canCreate(currentUser) && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setSelectedProtocol(null);
                setCreateModalOpen(true);
              }}
            >
              Create Protocol
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <Row gutter={16} className="mb-6">
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Total Protocols"
              value={pagination?.total || 0}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Active"
              value={protocols.filter(p => p.isActive).length}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Public"
              value={protocols.filter(p => p.isPublic).length}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Private"
              value={protocols.filter(p => !p.isPublic).length}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters & Actions Bar */}
      <Card className="mb-4">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <Space wrap>
            <Input.Search
              placeholder="Search protocols..."
              allowClear
              style={{ width: 250 }}
              onSearch={handleSearch}
              prefix={<SearchOutlined />}
            />
            <Select
              placeholder="Status"
              allowClear
              style={{ width: 120 }}
              onChange={(value) => handleFilterChange('isActive', value)}
            >
              <Option value={true}>Active</Option>
              <Option value={false}>Inactive</Option>
            </Select>
            <Select
              placeholder="Visibility"
              allowClear
              style={{ width: 120 }}
              onChange={(value) => handleFilterChange('isPublic', value)}
            >
              <Option value={true}>Public</Option>
              <Option value={false}>Private</Option>
            </Select>
          </Space>
          
          <Space>
            {selectedRowKeys.length > 0 && (
              <>
                <Text type="secondary">{selectedRowKeys.length} selected</Text>
                <Button onClick={() => handleBulkToggleActive(true)}>
                  Activate All
                </Button>
                <Button onClick={() => handleBulkToggleActive(false)}>
                  Deactivate All
                </Button>
                <Button danger onClick={handleBulkDelete}>
                  Delete Selected
                </Button>
              </>
            )}
            <Tooltip title="Refresh">
              <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
            </Tooltip>
          </Space>
        </div>
      </Card>

      {/* Data Table */}
      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={protocols}
          loading={isLoading}
          rowSelection={isResearcherOrAdmin(currentUser) ? rowSelection : undefined}
          pagination={{
            current: page,
            pageSize: pageSize,
            total: pagination?.total || 0,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} protocols`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
          scroll={{ x: 1000 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No protocols found"
              >
                {protocolPermissions.canCreate(currentUser) && (
                  <Button type="primary" onClick={() => setCreateModalOpen(true)}>
                    Create First Protocol
                  </Button>
                )}
              </Empty>
            ),
          }}
        />
      </Card>

      {/* Create/Edit Modal */}
      <ProtocolFormModal
        open={createModalOpen || editModalOpen}
        protocol={selectedProtocol}
        onClose={() => {
          setCreateModalOpen(false);
          setEditModalOpen(false);
          setSelectedProtocol(null);
        }}
        onSuccess={() => {
          setCreateModalOpen(false);
          setEditModalOpen(false);
          setSelectedProtocol(null);
          refetch();
        }}
      />

      {/* Detail Drawer */}
      <ProtocolDetailDrawer
        open={detailDrawerOpen}
        protocol={selectedProtocol}
        onClose={() => {
          setDetailDrawerOpen(false);
          setSelectedProtocol(null);
        }}
        onEdit={() => {
          setDetailDrawerOpen(false);
          setEditModalOpen(true);
        }}
      />

      {/* Soft Delete Confirmation Modal */}
      <Modal
        title="Soft Delete Protocol"
        open={deleteModalOpen}
        onOk={handleDeleteConfirm}
        onCancel={() => {
          setDeleteModalOpen(false);
          setProtocolToDelete(null);
        }}
        okText="Soft Delete"
        okButtonProps={{ danger: true, loading: deleteProtocol.isPending }}
      >
        <p>
          Are you sure you want to soft-delete <strong>{protocolToDelete?.name}</strong>?
        </p>
        <p className="text-gray-500 text-sm mt-2">
          The protocol will be hidden from listings and will be <strong>permanently deleted after 15 days</strong>.
        </p>
        <p className="text-blue-600 text-sm mt-2">
          💡 You can use <strong>Hard Delete</strong> to permanently remove it immediately (admin only).
        </p>
      </Modal>

      {/* Hard Delete Confirmation Modal */}
      <Modal
        title={
          <span className="text-red-600">
            ⚠️ Permanent Delete Warning
          </span>
        }
        open={hardDeleteModalOpen}
        onOk={handleHardDeleteConfirm}
        onCancel={() => {
          setHardDeleteModalOpen(false);
          setProtocolToDelete(null);
        }}
        okText="Permanently Delete"
        okButtonProps={{ danger: true, loading: hardDeleting }}
        cancelText="Cancel"
      >
        <div className="space-y-3">
          <p className="text-lg font-semibold">
            Are you sure you want to <span className="text-red-600">permanently delete</span> this protocol?
          </p>
          <div className="bg-red-50 border border-red-200 rounded p-3">
            <p className="font-semibold text-red-800">Protocol: {protocolToDelete?.name}</p>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
            <p className="font-semibold text-yellow-800">⚠️ Warning:</p>
            <ul className="list-disc ml-5 text-sm text-yellow-900 mt-2">
              <li>This action is <strong>IRREVERSIBLE</strong></li>
              <li>The protocol will be <strong>immediately deleted</strong> from the database</li>
              <li>All associated recordings will also be deleted</li>
              <li>No 15-day retention period applies</li>
              <li>This action will be logged in the audit trail</li>
            </ul>
          </div>
          <p className="text-sm text-gray-600">
            Consider using <strong>Soft Delete</strong> instead for a 15-day grace period before permanent deletion.
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default ProtocolsList;
