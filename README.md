# Resilient Email Service

A robust email delivery service with comprehensive resilience features including retry logic, fallback providers, circuit breakers, rate limiting, and real-time monitoring.

## 🚀 Features

### Core Resilience Patterns
- **Retry Logic with Exponential Backoff** - Automatically retries failed emails with increasing delays
- **Fallback Provider System** - Seamlessly switches between email providers on failure  
- **Circuit Breaker Pattern** - Temporarily disables failing providers to prevent cascading failures
- **Idempotency Protection** - Prevents duplicate email sends within time windows
- **Rate Limiting** - Configurable limits to prevent overwhelming providers
- **Real-time Status Tracking** - Monitor email delivery status and system health

### Advanced Features
- **Queue Management** - Asynchronous email processing with queue monitoring
- **Provider Health Monitoring** - Real-time status tracking of all email providers
- **Comprehensive Logging** - Detailed logs for debugging and monitoring
- **Event System** - Real-time updates via event listeners
- **Beautiful Dashboard** - Modern UI for monitoring and sending emails

## 🛠 Technology Stack

- **TypeScript** - Type-safe development
- **React** - Modern frontend framework
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Beautiful UI components
- **Jest** - Comprehensive testing framework
- **Vite** - Fast development and build tool

## 📦 Installation & Setup

### Prerequisites
- Node.js 18+ and npm

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <YOUR_GIT_URL>
   cd email-wizard-sends-swiftly
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Run tests**
   ```bash
   npm test
   ```

5. **Open your browser**
   Navigate to `http://localhost:8080` to see the email service dashboard.

## 🏗 Architecture

### EmailService Class
The core service implementing all resilience patterns:

```typescript
const emailService = new EmailService([
  new MockEmailProvider('SendGrid', 0.15, 800),
  new MockEmailProvider('Mailgun', 0.2, 1200)
], {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  circuitBreakerThreshold: 5,
  circuitBreakerResetTime: 60000,
  rateLimitPerMinute: 100
});
```

### Key Components

#### 1. **Retry Logic**
- Exponential backoff: `delay = initialDelay * (multiplier ^ attempt)`
- Maximum delay cap to prevent excessive wait times
- Configurable retry attempts per email

#### 2. **Circuit Breaker**
- Opens after threshold failures
- Half-open state for recovery testing
- Automatic reset after timeout period

#### 3. **Rate Limiting**
- Sliding window rate limiting
- Per-minute email sending limits
- Automatic reset every minute

#### 4. **Idempotency**
- Prevents duplicate sends within 5-minute windows
- Based on email content hash and recipient
- Returns existing attempt ID for duplicates

## 📊 Dashboard Features

### Send Email Tab
- Compose and send emails through the resilient system
- Real-time form validation
- Instant feedback on send status

### Status Monitoring
- Live email attempt tracking
- Success/failure rate statistics
- Queue length and processing status
- Rate limiting visualization

### Provider Health
- Real-time provider status monitoring
- Circuit breaker state visualization
- Failure count tracking
- Health indicators (Healthy/Degraded/Failed)

### System Logs
- Real-time log streaming
- Categorized by log level (INFO/WARN/ERROR)
- Searchable and filterable
- Automatic log rotation

## 🧪 Testing

### Test Coverage
- **Unit Tests**: All core functionality
- **Integration Tests**: End-to-end email flows
- **Edge Cases**: Error conditions and recovery
- **Concurrency Tests**: Multiple simultaneous operations

### Running Tests
```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run tests in watch mode
npm test -- --watch
```

### Test Categories
- Basic email sending functionality
- Idempotency protection
- Retry logic and exponential backoff
- Fallback mechanism between providers
- Circuit breaker pattern
- Rate limiting enforcement
- Status tracking and monitoring
- Event system functionality
- Edge cases and error handling

## 🔧 Configuration

### Email Service Configuration
```typescript
interface EmailServiceConfig {
  maxRetries: number;              // Maximum retry attempts (default: 3)
  initialDelayMs: number;          // Initial retry delay (default: 1000ms)
  maxDelayMs: number;              // Maximum retry delay (default: 10000ms)
  backoffMultiplier: number;       // Exponential backoff multiplier (default: 2)
  circuitBreakerThreshold: number; // Failures before circuit opens (default: 5)
  circuitBreakerResetTime: number; // Circuit reset timeout (default: 60000ms)
  rateLimitPerMinute: number;      // Max emails per minute (default: 100)
}
```

### Provider Configuration
```typescript
// Mock providers with configurable failure rates and latency
const provider = new MockEmailProvider(
  'ProviderName',
  0.15,    // 15% failure rate
  800      // 800ms average latency
);
```

## 📈 Monitoring & Observability

### Real-time Metrics
- Total emails sent/failed
- Success rate percentage
- Current queue length
- Rate limit usage
- Provider health status

### Event Streaming
```typescript
emailService.on('attemptCreated', (attempt) => {
  console.log('New email attempt:', attempt.id);
});

emailService.on('attemptUpdated', (attempt) => {
  console.log('Status update:', attempt.status);
});
```

## 🚀 Deployment

### Production Build
```bash
npm run build
```

### Environment Variables
No environment variables required - the service uses mock providers for demonstration.

### Cloud Deployment
This is a static frontend application that can be deployed to:
- Vercel
- Netlify
- AWS S3 + CloudFront
- GitHub Pages
- Any static hosting provider

## 🧩 Design Patterns

### SOLID Principles
- **Single Responsibility**: Each class has one clear purpose
- **Open/Closed**: Extensible provider system
- **Liskov Substitution**: Providers implement common interface
- **Interface Segregation**: Focused interfaces for specific concerns
- **Dependency Inversion**: Service depends on provider abstractions

### Resilience Patterns
- **Retry Pattern**: Automatic retry with exponential backoff
- **Circuit Breaker**: Fail-fast for degraded services
- **Bulkhead**: Provider isolation prevents cascading failures
- **Timeout**: Prevents hanging operations
- **Rate Limiting**: Protects against overload

## 🤝 API Reference

### Core Methods

#### `sendEmail(emailData: EmailData): Promise<string>`
Sends an email with full resilience features.

#### `getAttempt(id: string): EmailAttempt | null`
Retrieves a specific email attempt by ID.

#### `getAllAttempts(): EmailAttempt[]`
Returns all email attempts, sorted by creation time.

#### `getProviderStatus(): ProviderStatus[]`
Returns current status of all email providers.

#### `getQueueStatus(): QueueStatus`
Returns current queue length and processing status.

#### `getRateLimitStatus(): RateLimitStatus`
Returns current rate limiting information.

### Types

```typescript
interface EmailData {
  to: string;
  subject: string;
  body: string;
  from?: string;
}

enum EmailStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  SENDING = 'sending',
  SENT = 'sent',
  FAILED = 'failed',
  RATE_LIMITED = 'rate_limited'
}

enum ProviderStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  FAILED = 'failed'
}
```

## 🔍 Assumptions & Limitations

### Assumptions
- **Mock Providers**: Uses simulated email providers instead of real services
- **In-Memory Storage**: Email attempts stored in memory (use database in production)
- **Single Instance**: No clustering or distributed coordination
- **Simple Idempotency**: Basic content-based duplicate detection

### Production Considerations
- **Persistent Storage**: Use database for email attempts and logs
- **Real Providers**: Integrate with actual email services (SendGrid, Mailgun, etc.)
- **Distributed Systems**: Consider Redis for rate limiting and circuit breaker state
- **Monitoring**: Add metrics collection and alerting
- **Security**: Implement authentication and input validation

## 📝 License

This project is available for evaluation purposes. See the assignment requirements for usage terms.

## 🙋‍♂️ Support

For questions or issues:
1. Check the test suite for usage examples
2. Review the dashboard for real-time system status
3. Examine logs for debugging information

---

*Built with ❤️ using modern web technologies and resilience engineering principles.*