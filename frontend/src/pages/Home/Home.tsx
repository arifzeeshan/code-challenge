import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Flex,
  Form,
  Input,
  Layout,
  List,
  Row,
  Space,
  theme,
  Typography,
} from 'antd';
import { useNavigate } from 'react-router';
import { socket } from '../../socket';
import {
  CONNECTION_REPLACED_ERROR_CODE,
  type ChatStartedPayload,
  type ErrorMessagePayload,
  type UserId,
} from '../../types/socket';
import {
  MAX_CONNECTION_ID_LENGTH,
  USER_ID_STORAGE_KEY,
  canRequestChat,
  getStoredOrDefaultConnectionId,
  normalizeConnectionId,
  validateConnectionId,
} from './homeLogic';

const { Content } = Layout;
const { Paragraph, Text, Title } = Typography;

function initialUserId(): UserId {
  return getStoredOrDefaultConnectionId(window.sessionStorage);
}

export default function Home() {
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const [userId, setUserId] = useState<UserId>(initialUserId);
  const [registeredUserId, setRegisteredUserId] = useState<UserId>('');
  const [targetUserId, setTargetUserId] = useState<UserId>('');
  const [onlineUsers, setOnlineUsers] = useState<UserId[]>([]);
  const [status, setStatus] = useState<string>('Connecting to Wave Chat...');
  const [error, setError] = useState<string>('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isStartingChat, setIsStartingChat] = useState(false);
  const latestUserIdRef = useRef(userId);

  const otherOnlineUsers = onlineUsers.filter(
    (onlineUserId) => onlineUserId !== registeredUserId,
  );

  useEffect(() => {
    latestUserIdRef.current = registeredUserId || userId;
  }, [registeredUserId, userId]);

  useEffect(() => {
    socket.emit('chat:end');
  }, []);

  const registerConnectionId = useCallback((candidateUserId: UserId) => {
    const normalizedUserId = normalizeConnectionId(candidateUserId);
    const validationError = validateConnectionId(normalizedUserId);

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsRegistering(true);
    setError('');
    socket.emit('user:register', { userId: normalizedUserId }, (response) => {
      setIsRegistering(false);
      if (!response.ok || !response.data) {
        setError(response.error ?? 'Could not register that connection ID.');
        return;
      }

      setUserId(response.data.userId);
      setRegisteredUserId(response.data.userId);
      window.sessionStorage.setItem(USER_ID_STORAGE_KEY, response.data.userId);
      setStatus(`You are online as ${response.data.userId}.`);
    });
  }, []);

  useEffect(() => {
    const handleConnect = () => registerConnectionId(latestUserIdRef.current);
    const handleDisconnect = () => setStatus('Disconnected. Reconnecting...');
    const handleOnlineUsers = (payload: { users: UserId[] }) =>
      setOnlineUsers(payload.users);
    const handleStarted = (payload: ChatStartedPayload) =>
      navigate('/chat', { state: payload });
    const handleServerError = (payload: ErrorMessagePayload) => {
      setError(payload.message);

      if (payload.code === CONNECTION_REPLACED_ERROR_CODE) {
        setRegisteredUserId('');
        window.sessionStorage.removeItem(USER_ID_STORAGE_KEY);
        setStatus(
          'This connection ID is active in another window. Choose a new ID to go online here.',
        );
      }
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('users:online', handleOnlineUsers);
    socket.on('chat:started', handleStarted);
    socket.on('error:message', handleServerError);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('users:online', handleOnlineUsers);
      socket.off('chat:started', handleStarted);
      socket.off('error:message', handleServerError);
    };
  }, [navigate, registerConnectionId]);

  const chatReadiness = canRequestChat(
    registeredUserId,
    targetUserId,
    onlineUsers,
  );

  const startChat = () => {
    const normalizedTargetUserId = normalizeConnectionId(targetUserId);
    const readiness = canRequestChat(
      registeredUserId,
      normalizedTargetUserId,
      onlineUsers,
    );

    if (!readiness.ready) {
      setError(readiness.reason ?? 'Check the connection ID and try again.');
      return;
    }

    setIsStartingChat(true);
    setError('');
    setStatus(`Trying to connect with ${normalizedTargetUserId}...`);
    socket.emit(
      'chat:request',
      { targetUserId: normalizedTargetUserId },
      (response) => {
        setIsStartingChat(false);
        if (!response.ok) {
          setError(response.error ?? 'Could not start the chat.');
          setStatus(`You are online as ${registeredUserId}.`);
        }
      },
    );
  };

  const copyConnectionId = async () => {
    try {
      await navigator.clipboard.writeText(registeredUserId || userId);
      setStatus('Connection ID copied.');
    } catch {
      setError('Could not copy the connection ID from this browser.');
    }
  };

  return (
    <Layout
      style={{
        minHeight: '100vh',
        padding: token.paddingLG,
      }}
    >
      <Content
        style={{
          maxWidth: 1120,
          margin: '0 auto',
          width: '100%',
        }}
      >
        <Flex vertical gap="large">
          <Space
            align="center"
            direction="vertical"
            size="small"
            style={{
              textAlign: 'center',
              width: '100%',
            }}
          >
            <Text strong type="secondary">
              Wave Chat
            </Text>
            <Title level={1}>
              Real-time chat for two people
            </Title>
            <Paragraph type="secondary">
              Choose your connection ID and start a private
              live conversation when both of you are online.
            </Paragraph>
          </Space>

          <Row gutter={[24, 24]}>
            <Col xs={24} lg={15}>
              <Card>
                <Flex vertical gap="large">
                  <Form
                    layout="vertical"
                    onFinish={() => registerConnectionId(userId)}
                  >
                    <Form.Item label="Your connection ID">
                      <Space.Compact block>
                        <Input
                          aria-label="Your connection ID"
                          maxLength={MAX_CONNECTION_ID_LENGTH}
                          value={userId}
                          onChange={(event) => setUserId(event.target.value)}
                        />
                        <Button
                          htmlType="submit"
                          loading={isRegistering}
                          type="primary"
                        >
                          Go online
                        </Button>
                      </Space.Compact>
                    </Form.Item>
                  </Form>

                  <Alert
                    action={
                      registeredUserId ? (
                        <Button
                          size="small"
                          type="link"
                          onClick={copyConnectionId}
                        >
                          Copy ID
                        </Button>
                      ) : undefined
                    }
                    message={status}
                    showIcon
                    type={registeredUserId ? 'success' : 'info'}
                  />

                  <Form layout="vertical" onFinish={startChat}>
                    <Form.Item
                      help={
                        !chatReadiness.ready && targetUserId
                          ? chatReadiness.reason
                          : undefined
                      }
                      label="Connect to"
                      validateStatus={
                        !chatReadiness.ready && targetUserId
                          ? 'warning'
                          : undefined
                      }
                    >
                      <Space.Compact block>
                        <Input
                          aria-label="Connection ID to chat with"
                          maxLength={MAX_CONNECTION_ID_LENGTH}
                          value={targetUserId}
                          onChange={(event) =>
                            setTargetUserId(event.target.value)
                          }
                        />
                        <Button
                          disabled={!chatReadiness.ready}
                          htmlType="submit"
                          loading={isStartingChat}
                          type="primary"
                        >
                          Start chat
                        </Button>
                      </Space.Compact>
                    </Form.Item>
                  </Form>

                  {error ? (
                    <Alert message={error} role="alert" showIcon type="error" />
                  ) : null}
                </Flex>
              </Card>
            </Col>

            <Col xs={24} lg={9}>
              <Card title="Online now">
                <List
                  dataSource={otherOnlineUsers}
                  locale={{ emptyText: 'No other users are online yet.' }}
                  renderItem={(onlineUserId) => (
                    <List.Item>
                      <Text strong>{onlineUserId}</Text>
                    </List.Item>
                  )}
                />
              </Card>
            </Col>
          </Row>
        </Flex>
      </Content>
    </Layout>
  );
}
