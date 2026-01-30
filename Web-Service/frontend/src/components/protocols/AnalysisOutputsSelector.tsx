import React from 'react';
import {
  Checkbox,
  Select,
  Space,
  Typography,
  Row,
  Col,
  Collapse,
  Tooltip
} from 'antd';
import {
  LineChartOutlined,
  DotChartOutlined,
  RadarChartOutlined,
  BarChartOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import type {
  AnalysisOutputsConfig,
  Hand,
  Fingertip,
  Finger,
  RomPlotType,
  RomMeasurement
} from '../../types/protocol-movements.types';
import {
  ANALYSIS_OUTPUT_LABELS,
  ANALYSIS_OUTPUT_DESCRIPTIONS,
  HAND_LABELS,
  FINGERTIP_LABELS,
  FINGER_LABELS,
  ROM_MEASUREMENT_LABELS,
  ROM_PLOT_TYPE_LABELS,
  DEFAULT_ANALYSIS_OUTPUTS_CONFIG
} from '../../types/protocol-movements.types';

const { Text, Title } = Typography;
const { Panel } = Collapse;

interface AnalysisOutputsSelectorProps {
  config: AnalysisOutputsConfig;
  onChange: (config: AnalysisOutputsConfig) => void;
}

const handOptions = Object.entries(HAND_LABELS).map(([value, label]) => ({
  value,
  label
}));

const fingertipOptions = Object.entries(FINGERTIP_LABELS).map(([value, label]) => ({
  value,
  label
}));

const fingerOptions = Object.entries(FINGER_LABELS).map(([value, label]) => ({
  value,
  label
}));

export const AnalysisOutputsSelector: React.FC<AnalysisOutputsSelectorProps> = ({
  config,
  onChange
}) => {
  const safeConfig = { ...DEFAULT_ANALYSIS_OUTPUTS_CONFIG, ...config };

  const renderOutputHeader = (
    key: keyof AnalysisOutputsConfig,
    label: string,
    description: string,
    icon: React.ReactNode,
    enabled: boolean
  ) => (
    <div className="flex items-center gap-2">
      <Checkbox
        checked={enabled}
        onChange={(e) => {
          e.stopPropagation();
          onChange({
            ...safeConfig,
            [key]: { ...safeConfig[key], enabled: e.target.checked }
          });
        }}
        onClick={(e) => e.stopPropagation()}
      />
      {icon}
      <span className="font-medium">{label}</span>
      <Tooltip title={description}>
        <InfoCircleOutlined className="text-gray-400" />
      </Tooltip>
    </div>
  );

  return (
    <div className="analysis-outputs-selector">
      <Title level={5} className="!mb-3">Analysis Results Output</Title>
      <Text type="secondary" className="block mb-4">
        Select which analysis outputs should be generated for this protocol. Each output represents a backend analysis point for the keypoint data pipeline.
      </Text>

      <Collapse
        className="bg-white"
        expandIconPosition="end"
        bordered={false}
      >
        {/* Hand Aperture */}
        <Panel
          key="handAperture"
          header={renderOutputHeader(
            'handAperture',
            ANALYSIS_OUTPUT_LABELS.hand_aperture,
            ANALYSIS_OUTPUT_DESCRIPTIONS.hand_aperture,
            <DotChartOutlined />,
            safeConfig.handAperture.enabled
          )}
          className="mb-2"
        >
          <Row gutter={16}>
            <Col span={12}>
              <Text type="secondary" className="text-xs block mb-1">Finger Pair</Text>
              <Select
                value={safeConfig.handAperture.fingerPair}
                onChange={(value) => onChange({
                  ...safeConfig,
                  handAperture: { ...safeConfig.handAperture, fingerPair: value }
                })}
                disabled={!safeConfig.handAperture.enabled}
                style={{ width: '100%' }}
                size="small"
                options={[
                  { value: 'thumb_index', label: 'Thumb - Index' },
                  { value: 'thumb_middle', label: 'Thumb - Middle' }
                ]}
              />
            </Col>
            <Col span={12}>
              <Text type="secondary" className="text-xs block mb-1">Hand</Text>
              <Select
                value={safeConfig.handAperture.hand}
                onChange={(value) => onChange({
                  ...safeConfig,
                  handAperture: { ...safeConfig.handAperture, hand: value as Hand }
                })}
                disabled={!safeConfig.handAperture.enabled}
                style={{ width: '100%' }}
                size="small"
                options={handOptions}
              />
            </Col>
          </Row>
        </Panel>

        {/* 3D Cyclogram */}
        <Panel
          key="cyclogram3D"
          header={renderOutputHeader(
            'cyclogram3D',
            ANALYSIS_OUTPUT_LABELS.cyclogram_3d,
            ANALYSIS_OUTPUT_DESCRIPTIONS.cyclogram_3d,
            <LineChartOutlined />,
            safeConfig.cyclogram3D.enabled
          )}
          className="mb-2"
        >
          <Row gutter={16}>
            <Col span={12}>
              <Text type="secondary" className="text-xs block mb-1">Fingertip Keypoint</Text>
              <Select
                value={safeConfig.cyclogram3D.fingertip}
                onChange={(value) => onChange({
                  ...safeConfig,
                  cyclogram3D: { ...safeConfig.cyclogram3D, fingertip: value as Fingertip }
                })}
                disabled={!safeConfig.cyclogram3D.enabled}
                style={{ width: '100%' }}
                size="small"
                options={fingertipOptions}
              />
            </Col>
            <Col span={12}>
              <Text type="secondary" className="text-xs block mb-1">Hand</Text>
              <Select
                value={safeConfig.cyclogram3D.hand}
                onChange={(value) => onChange({
                  ...safeConfig,
                  cyclogram3D: { ...safeConfig.cyclogram3D, hand: value as Hand }
                })}
                disabled={!safeConfig.cyclogram3D.enabled}
                style={{ width: '100%' }}
                size="small"
                options={handOptions}
              />
            </Col>
          </Row>
        </Panel>

        {/* 3D Trajectory */}
        <Panel
          key="trajectory3D"
          header={renderOutputHeader(
            'trajectory3D',
            ANALYSIS_OUTPUT_LABELS.trajectory_3d,
            ANALYSIS_OUTPUT_DESCRIPTIONS.trajectory_3d,
            <LineChartOutlined />,
            safeConfig.trajectory3D.enabled
          )}
          className="mb-2"
        >
          <Row gutter={16}>
            <Col span={12}>
              <Text type="secondary" className="text-xs block mb-1">Fingertip Keypoint</Text>
              <Select
                value={safeConfig.trajectory3D.fingertip}
                onChange={(value) => onChange({
                  ...safeConfig,
                  trajectory3D: { ...safeConfig.trajectory3D, fingertip: value as Fingertip }
                })}
                disabled={!safeConfig.trajectory3D.enabled}
                style={{ width: '100%' }}
                size="small"
                options={fingertipOptions}
              />
            </Col>
            <Col span={12}>
              <Text type="secondary" className="text-xs block mb-1">Hand</Text>
              <Select
                value={safeConfig.trajectory3D.hand}
                onChange={(value) => onChange({
                  ...safeConfig,
                  trajectory3D: { ...safeConfig.trajectory3D, hand: value as Hand }
                })}
                disabled={!safeConfig.trajectory3D.enabled}
                style={{ width: '100%' }}
                size="small"
                options={handOptions}
              />
            </Col>
          </Row>
        </Panel>

        {/* ROM Plot */}
        <Panel
          key="romPlot"
          header={renderOutputHeader(
            'romPlot',
            ANALYSIS_OUTPUT_LABELS.rom_plot,
            ANALYSIS_OUTPUT_DESCRIPTIONS.rom_plot,
            <RadarChartOutlined />,
            safeConfig.romPlot.enabled
          )}
          className="mb-2"
        >
          <Row gutter={16} className="mb-3">
            <Col span={8}>
              <Text type="secondary" className="text-xs block mb-1">Plot Type</Text>
              <Select
                value={safeConfig.romPlot.plotType}
                onChange={(value) => onChange({
                  ...safeConfig,
                  romPlot: { ...safeConfig.romPlot, plotType: value as RomPlotType }
                })}
                disabled={!safeConfig.romPlot.enabled}
                style={{ width: '100%' }}
                size="small"
                options={Object.entries(ROM_PLOT_TYPE_LABELS).map(([value, label]) => ({
                  value,
                  label
                }))}
              />
            </Col>
            <Col span={8}>
              <Text type="secondary" className="text-xs block mb-1">Measurement</Text>
              <Select
                value={safeConfig.romPlot.measurement}
                onChange={(value) => onChange({
                  ...safeConfig,
                  romPlot: { ...safeConfig.romPlot, measurement: value as RomMeasurement }
                })}
                disabled={!safeConfig.romPlot.enabled}
                style={{ width: '100%' }}
                size="small"
                options={Object.entries(ROM_MEASUREMENT_LABELS).map(([value, label]) => ({
                  value,
                  label
                }))}
              />
            </Col>
            <Col span={8}>
              <Text type="secondary" className="text-xs block mb-1">Hand</Text>
              <Select
                value={safeConfig.romPlot.hand}
                onChange={(value) => onChange({
                  ...safeConfig,
                  romPlot: { ...safeConfig.romPlot, hand: value as Hand }
                })}
                disabled={!safeConfig.romPlot.enabled}
                style={{ width: '100%' }}
                size="small"
                options={handOptions}
              />
            </Col>
          </Row>
          <Text type="secondary" className="text-xs block mb-2">Select Fingers (all 3 joints per finger)</Text>
          <Checkbox.Group
            value={Object.entries(safeConfig.romPlot.fingers || {})
              .filter(([_, checked]) => checked)
              .map(([finger]) => finger)}
            onChange={(values) => {
              const fingers = {
                thumb: values.includes('thumb'),
                index: values.includes('index'),
                middle: values.includes('middle'),
                ring: values.includes('ring'),
                pinky: values.includes('pinky')
              };
              onChange({
                ...safeConfig,
                romPlot: { ...safeConfig.romPlot, fingers }
              });
            }}
            disabled={!safeConfig.romPlot.enabled}
          >
            <Space>
              {Object.entries(FINGER_LABELS).map(([value, label]) => (
                <Checkbox key={value} value={value}>{label}</Checkbox>
              ))}
            </Space>
          </Checkbox.Group>
        </Panel>

        {/* Tremor Spectrogram */}
        <Panel
          key="tremorSpectrogram"
          header={renderOutputHeader(
            'tremorSpectrogram',
            ANALYSIS_OUTPUT_LABELS.tremor_spectrogram,
            ANALYSIS_OUTPUT_DESCRIPTIONS.tremor_spectrogram,
            <BarChartOutlined />,
            safeConfig.tremorSpectrogram.enabled
          )}
          className="mb-2"
        >
          <Row gutter={16}>
            <Col span={12}>
              <Text type="secondary" className="text-xs block mb-1">Hand (separate output per hand)</Text>
              <Select
                value={safeConfig.tremorSpectrogram.hand}
                onChange={(value) => onChange({
                  ...safeConfig,
                  tremorSpectrogram: { ...safeConfig.tremorSpectrogram, hand: value as Hand }
                })}
                disabled={!safeConfig.tremorSpectrogram.enabled}
                style={{ width: '100%' }}
                size="small"
                options={handOptions}
              />
            </Col>
          </Row>
        </Panel>

        {/* Opening-Closing Velocity */}
        <Panel
          key="openingClosingVelocity"
          header={renderOutputHeader(
            'openingClosingVelocity',
            ANALYSIS_OUTPUT_LABELS.opening_closing_velocity,
            ANALYSIS_OUTPUT_DESCRIPTIONS.opening_closing_velocity,
            <BarChartOutlined />,
            safeConfig.openingClosingVelocity.enabled
          )}
          className="mb-2"
        >
          <Row gutter={16}>
            <Col span={12}>
              <Text type="secondary" className="text-xs block mb-1">Hand</Text>
              <Select
                value={safeConfig.openingClosingVelocity.hand}
                onChange={(value) => onChange({
                  ...safeConfig,
                  openingClosingVelocity: { ...safeConfig.openingClosingVelocity, hand: value as Hand }
                })}
                disabled={!safeConfig.openingClosingVelocity.enabled}
                style={{ width: '100%' }}
                size="small"
                options={handOptions}
              />
            </Col>
          </Row>
        </Panel>

        {/* Cycle Frequency */}
        <Panel
          key="cycleFrequency"
          header={renderOutputHeader(
            'cycleFrequency',
            ANALYSIS_OUTPUT_LABELS.cycle_frequency,
            ANALYSIS_OUTPUT_DESCRIPTIONS.cycle_frequency,
            <BarChartOutlined />,
            safeConfig.cycleFrequency.enabled
          )}
          className="mb-2"
        >
          <Row gutter={16}>
            <Col span={12}>
              <Text type="secondary" className="text-xs block mb-1">Hand</Text>
              <Select
                value={safeConfig.cycleFrequency.hand}
                onChange={(value) => onChange({
                  ...safeConfig,
                  cycleFrequency: { ...safeConfig.cycleFrequency, hand: value as Hand }
                })}
                disabled={!safeConfig.cycleFrequency.enabled}
                style={{ width: '100%' }}
                size="small"
                options={handOptions}
              />
            </Col>
          </Row>
        </Panel>

        {/* Cycle Variability */}
        <Panel
          key="cycleVariability"
          header={renderOutputHeader(
            'cycleVariability',
            ANALYSIS_OUTPUT_LABELS.cycle_variability,
            ANALYSIS_OUTPUT_DESCRIPTIONS.cycle_variability,
            <DotChartOutlined />,
            safeConfig.cycleVariability.enabled
          )}
          className="mb-2"
        >
          <Row gutter={16}>
            <Col span={12}>
              <Text type="secondary" className="text-xs block mb-1">Hand</Text>
              <Select
                value={safeConfig.cycleVariability.hand}
                onChange={(value) => onChange({
                  ...safeConfig,
                  cycleVariability: { ...safeConfig.cycleVariability, hand: value as Hand }
                })}
                disabled={!safeConfig.cycleVariability.enabled}
                style={{ width: '100%' }}
                size="small"
                options={handOptions}
              />
            </Col>
          </Row>
        </Panel>

        {/* Inter-Finger Coordination */}
        <Panel
          key="interFingerCoordination"
          header={renderOutputHeader(
            'interFingerCoordination',
            ANALYSIS_OUTPUT_LABELS.inter_finger_coordination,
            ANALYSIS_OUTPUT_DESCRIPTIONS.inter_finger_coordination,
            <LineChartOutlined />,
            safeConfig.interFingerCoordination.enabled
          )}
          className="mb-2"
        >
          <Row gutter={16}>
            <Col span={8}>
              <Text type="secondary" className="text-xs block mb-1">Finger 1</Text>
              <Select
                value={safeConfig.interFingerCoordination.finger1}
                onChange={(value) => onChange({
                  ...safeConfig,
                  interFingerCoordination: { ...safeConfig.interFingerCoordination, finger1: value as Finger }
                })}
                disabled={!safeConfig.interFingerCoordination.enabled}
                style={{ width: '100%' }}
                size="small"
                options={fingerOptions}
              />
            </Col>
            <Col span={8}>
              <Text type="secondary" className="text-xs block mb-1">Finger 2</Text>
              <Select
                value={safeConfig.interFingerCoordination.finger2}
                onChange={(value) => onChange({
                  ...safeConfig,
                  interFingerCoordination: { ...safeConfig.interFingerCoordination, finger2: value as Finger }
                })}
                disabled={!safeConfig.interFingerCoordination.enabled}
                style={{ width: '100%' }}
                size="small"
                options={fingerOptions}
              />
            </Col>
            <Col span={8}>
              <Text type="secondary" className="text-xs block mb-1">Hand</Text>
              <Select
                value={safeConfig.interFingerCoordination.hand}
                onChange={(value) => onChange({
                  ...safeConfig,
                  interFingerCoordination: { ...safeConfig.interFingerCoordination, hand: value as Hand }
                })}
                disabled={!safeConfig.interFingerCoordination.enabled}
                style={{ width: '100%' }}
                size="small"
                options={handOptions}
              />
            </Col>
          </Row>
        </Panel>

        {/* Cycle Symmetry */}
        <Panel
          key="cycleSymmetry"
          header={renderOutputHeader(
            'cycleSymmetry',
            ANALYSIS_OUTPUT_LABELS.cycle_symmetry,
            ANALYSIS_OUTPUT_DESCRIPTIONS.cycle_symmetry,
            <LineChartOutlined />,
            safeConfig.cycleSymmetry.enabled
          )}
          className="mb-2"
        >
          <Text type="secondary" className="text-xs">
            This analysis compares left hand vs right hand cycle patterns automatically.
          </Text>
        </Panel>

        {/* Geometric Curvature */}
        <Panel
          key="geometricCurvature"
          header={renderOutputHeader(
            'geometricCurvature',
            ANALYSIS_OUTPUT_LABELS.geometric_curvature,
            ANALYSIS_OUTPUT_DESCRIPTIONS.geometric_curvature,
            <RadarChartOutlined />,
            safeConfig.geometricCurvature.enabled
          )}
          className="mb-2"
        >
          <Row gutter={16}>
            <Col span={12}>
              <Text type="secondary" className="text-xs block mb-1">Hand</Text>
              <Select
                value={safeConfig.geometricCurvature.hand}
                onChange={(value) => onChange({
                  ...safeConfig,
                  geometricCurvature: { ...safeConfig.geometricCurvature, hand: value as Hand }
                })}
                disabled={!safeConfig.geometricCurvature.enabled}
                style={{ width: '100%' }}
                size="small"
                options={handOptions}
              />
            </Col>
          </Row>
        </Panel>
      </Collapse>
    </div>
  );
};

export default AnalysisOutputsSelector;
