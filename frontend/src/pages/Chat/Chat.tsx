import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Divider,
  Empty,
  Flex,
  Form,
  Input,
  Layout,
  Space,
  theme,
  Typography,
} from 'antd';
import { useLocation, useNavigate } from 'react-router';
import { socket } from '../../socket';
import type {
  ChatEndedPayload,
  ChatMessage,
  ChatStartedPayload,
} from '../../types/socket';
import {
  MAX_MESSAGE_LENGTH,
  appendUniqueMessage,
  formatMessageTime,
  isValidChatSession,
  sanitizeOutgoingMessage,
} from './chatLogic';

const { Content } = Layout;
const { Paragraph, Text, Title } = Typography;
const { TextArea } = Input;

function describeChatEnd(
  ended: ChatEndedPayload | undefined,
  session: ChatStartedPayload,
): string {
  if (!ended) {
    return '';
  }

  if (ended.reason === 'disconnect' && !ended.endedBy) {
    return 'The connection was interrupted, so this chat ended.';
  }

  if (ended.endedBy === session.selfUserId) {
    return 'You ended the chat.';
  }

  return `${ended.endedBy ?? session.peerUserId} ended the chat.`;
}

export default function Chat() {
  const location = useLocation();
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const locationSession = isValidChatSession(location.state)
    ? location.state
    : undefined;
  const [session] = useState<ChatStartedPayload | undefined>(
    () => locationSession,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [ended, setEnded] = useState<ChatEndedPayload | undefined>();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const chatEnded = Boolean(ended);
  const chatTitle = session
    ? `Chat with ${session.peerUserId}`
    : 'No active chat';

  useEffect(() => {
    if (!session) {
      return;
    }

    const handleMessage = (message: ChatMessage) => {
      if (message.chatId === session.chatId) {
        setMessages((currentMessages) =>
          appendUniqueMessage(currentMessages, message),
        );
      }
    };
    const handleChatEnded = (payload: ChatEndedPayload) => {
      if (payload.chatId === session.chatId) {
        setEnded(payload);
      }
    };
    const handleReconnect = () => {
      setEnded(
        (current) =>
          current ?? { chatId: session.chatId, reason: 'disconnect' },
      );
      setError(
        'The socket connection changed, so this chat was closed. Return home to start a new chat.',
      );
    };

    socket.on('message:received', handleMessage);
    socket.on('chat:ended', handleChatEnded);
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('message:received', handleMessage);
      socket.off('chat:ended', handleChatEnded);
      socket.off('connect', handleReconnect);
    };
  }, [session]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (!session || chatEnded) {
      return;
    }

    const handleBeforeUnload = () => {
      socket.emit('chat:end');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [chatEnded, session]);

  const sendMessage = () => {
    if (!session || chatEnded || isSending) {
      return;
    }

    const validation = sanitizeOutgoingMessage(draft);
    if (!validation.valid) {
      setError(validation.error ?? 'Check your message and try again.');
      return;
    }

    setIsSending(true);
    setError('');
    socket.emit(
      'message:send',
      { chatId: session.chatId, text: validation.text },
      (response) => {
        setIsSending(false);
        if (!response.ok) {
          setError(response.error ?? 'Could not send your message.');
          return;
        }
        setDraft('');
      },
    );
  };

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const endChat = () => {
    if (!session || chatEnded) {
      navigate('/');
      return;
    }

    socket.emit('chat:end', (response) => {
      if (!response.ok) {
        setError(response.error ?? 'Could not end the chat.');
      }
    });
  };

  if (!session) {
    return (
      <Layout
        style={{
          minHeight: '100vh',
          padding: token.paddingLG,
        }}
      >
        <Content
          style={{
            display: 'grid',
            margin: '0 auto',
            maxWidth: 520,
            placeItems: 'center',
            width: '100%',
          }}
        >
        <Card style={{ width: '100%' }}>
          <Empty
            description="Start a conversation from the home page to open the chat screen."
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" onClick={() => navigate('/')}>
              Return home
            </Button>
          </Empty>
        </Card>
        </Content>
      </Layout>
    );
  }

  return (
    <Layout
      style={{
        minHeight: '100vh',
        padding: token.paddingLG,
      }}
    >
      <Content
        style={{
          margin: '0 auto',
          maxWidth: 980,
          width: '100%',
        }}
      >
      <Card>
        <Flex vertical gap="middle">
          <Flex align="flex-start" gap="middle" justify="space-between" wrap>
            <Space direction="vertical" size={0}>
              <Text strong type="secondary">
                Wave Chat
              </Text>
              <Title level={2}>
                {chatTitle}
              </Title>
              <Text type="secondary">
                You are {session.selfUserId}. Chat started with{' '}
                {session.peerUserId}.
              </Text>
            </Space>
            <Space>
              <Button danger onClick={endChat}>
                Quit chat
              </Button>
              {chatEnded ? (
                <Button type="primary" onClick={() => navigate('/')}>
                  Back home
                </Button>
              ) : null}
            </Space>
          </Flex>

        {chatEnded ? (
          <Alert
            message={describeChatEnd(ended, session)}
            role="status"
            showIcon
            type="warning"
          />
        ) : null}

        {error ? (
          <Alert message={error} role="alert" showIcon type="error" />
        ) : null}

        <Flex
          align={messages.length === 0 ? 'center' : undefined}
          aria-live="polite"
          gap="middle"
          justify={messages.length === 0 ? 'center' : undefined}
          style={{
            maxHeight: 'min(56vh, 620px)',
            minHeight: 380,
            overflowY: 'auto',
            padding: `${token.paddingLG}px ${token.paddingXXS}px`,
          }}
          vertical
        >
          {messages.length === 0 ? (
            <Empty
              description="No messages yet. Say hello to start the wave."
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            messages.map((message) => {
              const isMine = message.senderId === session.selfUserId;
              return (
                <article
                  key={message.id}
                  style={{
                    alignSelf: isMine ? 'flex-end' : 'flex-start',
                    background: isMine ? token.colorPrimary : token.colorFillTertiary,
                    borderBottomLeftRadius: isMine ? token.borderRadiusLG : token.borderRadiusXS,
                    borderBottomRightRadius: isMine ? token.borderRadiusXS : token.borderRadiusLG,
                    borderRadius: token.borderRadiusLG,
                    color: isMine ? token.colorWhite : token.colorText,
                    maxWidth: 'min(74%, 620px)',
                    padding: `${token.paddingSM}px ${token.padding}px`,
                    width: 'fit-content',
                  }}
                >
                  <Text
                    strong
                    style={{
                      color: isMine ? token.colorWhite : undefined,
                      display: 'block',
                      fontSize: token.fontSizeSM,
                    }}
                  >
                    {isMine ? 'You' : message.senderId}
                  </Text>
                  <Paragraph
                    style={{
                      color: isMine ? token.colorWhite : undefined,
                      margin: `${token.marginXXS}px 0`,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {message.text}
                  </Paragraph>
                  <Text
                    style={{
                      color: isMine ? token.colorWhite : undefined,
                      display: 'block',
                      fontSize: token.fontSizeSM,
                      opacity: 0.78,
                      textAlign: 'right',
                    }}
                  >
                    {formatMessageTime(message.sentAt)}
                  </Text>
                </article>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </Flex>

        <Divider />

        <Form layout="vertical">
          <Form.Item
            extra={
              <Flex gap="small" justify="space-between" wrap>
                <Text type="secondary">
                  Press Enter to send, Shift + Enter for a new line.
                </Text>
                <Text type="secondary">
                  {draft.length}/{MAX_MESSAGE_LENGTH}
                </Text>
              </Flex>
            }
            label="Message"
          >
            <Space.Compact block>
              <TextArea
                aria-label="Message"
                autoSize={{ minRows: 1, maxRows: 4 }}
                disabled={chatEnded}
                maxLength={MAX_MESSAGE_LENGTH}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleDraftKeyDown}
              />
              <Button
                disabled={chatEnded || isSending}
                loading={isSending}
                type="primary"
                onClick={sendMessage}
              >
                Send
              </Button>
            </Space.Compact>
          </Form.Item>
        </Form>
        </Flex>
      </Card>
      </Content>
    </Layout>
  );
}
