/**
 * Resilient Email Service Implementation
 * 
 * Features:
 * - Retry logic with exponential backoff
 * - Fallback mechanism between providers
 * - Idempotency to prevent duplicate sends
 * - Rate limiting
 * - Status tracking
 * - Circuit breaker pattern
 * - Simple logging
 * - Basic queue system
 */

export const EmailStatus = {
  PENDING: 'pending',
  QUEUED: 'queued',
  SENDING: 'sending',
  SENT: 'sent',
  FAILED: 'failed',
  RATE_LIMITED: 'rate_limited'
};

export const ProviderStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  FAILED: 'failed'
};

export class Logger {
  constructor() {
    this.logs = [];
  }

  info(message, data) {
    this.log('INFO', message, data);
  }

  warn(message, data) {
    this.log('WARN', message, data);
  }

  error(message, data) {
    this.log('ERROR', message, data);
  }

  log(level, message, data) {
    const entry = { timestamp: new Date(), level, message, data };
    this.logs.push(entry);
    console.log(`[${level}] ${message}`, data || '');
    
    // Keep only last 100 logs
    if (this.logs.length > 100) {
      this.logs.shift();
    }
  }

  getLogs() {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
  }
}

export class MockEmailProvider {
  constructor(name, failureRate = 0.2, latencyMs = 1000) {
    this.name = name;
    this.failureRate = failureRate;
    this.latencyMs = latencyMs;
  }

  async sendEmail(email) {
    // Simulate network latency
    await new Promise(resolve => setTimeout(resolve, this.latencyMs + Math.random() * 500));

    // Simulate random failures
    if (Math.random() < this.failureRate) {
      throw new Error(`${this.name} provider failure: Network timeout`);
    }

    return {
      success: true,
      messageId: `${this.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
  }

  // Methods for testing
  setFailureRate(rate) {
    this.failureRate = rate;
  }

  setLatency(ms) {
    this.latencyMs = ms;
  }
}

export class EmailService {
  constructor(
    providers,
    config = {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
      circuitBreakerThreshold: 5,
      circuitBreakerResetTime: 60000,
      rateLimitPerMinute: 100
    }
  ) {
    this.providers = providers;
    this.config = config;
    this.attempts = new Map();
    this.circuitBreakers = new Map();
    this.queue = [];
    this.processingQueue = false;
    this.logger = new Logger();
    this.eventListeners = new Map();
    
    this.rateLimitState = {
      count: 0,
      resetTime: new Date(Date.now() + 60000)
    };

    // Initialize circuit breakers
    providers.forEach(provider => {
      this.circuitBreakers.set(provider.name, {
        isOpen: false,
        failureCount: 0
      });
    });

    this.logger.info('EmailService initialized', { 
      providers: providers.map(p => p.name),
      config: this.config 
    });
  }

  /**
   * Send an email with full resilience features
   */
  async sendEmail(email) {
    const attemptId = this.generateId();
    
    // Check for idempotency (simplified - in production use email hash + timestamp)
    const existingAttempt = this.findExistingAttempt(email);
    if (existingAttempt) {
      this.logger.warn('Duplicate email detected', { attemptId, existingId: existingAttempt.id });
      return existingAttempt.id;
    }

    // Create attempt record
    const attempt = {
      id: attemptId,
      email,
      status: EmailStatus.PENDING,
      attempts: 0,
      maxAttempts: this.config.maxRetries,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.attempts.set(attemptId, attempt);
    this.emit('attemptCreated', attempt);

    // Check rate limiting
    if (!this.checkRateLimit()) {
      attempt.status = EmailStatus.RATE_LIMITED;
      attempt.error = 'Rate limit exceeded';
      this.attempts.set(attemptId, attempt);
      this.emit('attemptUpdated', attempt);
      this.logger.warn('Rate limit exceeded', { attemptId });
      throw new Error('Rate limit exceeded. Please try again later.');
    }

    // Add to queue
    this.queue.push(attemptId);
    attempt.status = EmailStatus.QUEUED;
    this.attempts.set(attemptId, attempt);
    this.emit('attemptUpdated', attempt);

    this.logger.info('Email queued for sending', { attemptId, to: email.to });
    
    // Process queue
    this.processQueue();

    return attemptId;
  }

  /**
   * Process the email queue
   */
  async processQueue() {
    if (this.processingQueue) return;
    this.processingQueue = true;

    while (this.queue.length > 0) {
      const attemptId = this.queue.shift();
      const attempt = this.attempts.get(attemptId);
      
      if (!attempt) continue;

      try {
        await this.processEmailAttempt(attempt);
      } catch (error) {
        this.logger.error('Error processing email attempt', { attemptId, error: error.message });
      }
    }

    this.processingQueue = false;
  }

  /**
   * Process a single email attempt with retry and fallback logic
   */
  async processEmailAttempt(attempt) {
    attempt.status = EmailStatus.SENDING;
    this.attempts.set(attempt.id, attempt);
    this.emit('attemptUpdated', attempt);

    for (let i = 0; i < this.config.maxRetries; i++) {
      attempt.attempts = i + 1;
      attempt.updatedAt = new Date();
      this.attempts.set(attempt.id, attempt);
      this.emit('attemptUpdated', attempt);

      // Try each provider
      for (const provider of this.providers) {
        if (this.isCircuitBreakerOpen(provider.name)) {
          this.logger.warn('Circuit breaker open, skipping provider', { 
            provider: provider.name, 
            attemptId: attempt.id 
          });
          continue;
        }

        try {
          this.logger.info('Attempting to send email', { 
            provider: provider.name, 
            attempt: i + 1,
            attemptId: attempt.id 
          });

          const result = await provider.sendEmail(attempt.email);
          
          if (result.success) {
            // Success!
            attempt.status = EmailStatus.SENT;
            attempt.sentAt = new Date();
            attempt.messageId = result.messageId;
            attempt.provider = provider.name;
            this.attempts.set(attempt.id, attempt);
            
            this.recordProviderSuccess(provider.name);
            this.incrementRateLimit();
            this.emit('attemptUpdated', attempt);
            
            this.logger.info('Email sent successfully', { 
              attemptId: attempt.id,
              provider: provider.name,
              messageId: result.messageId 
            });
            
            return;
          }
        } catch (error) {
          this.logger.error('Provider failed to send email', { 
            provider: provider.name,
            attemptId: attempt.id,
            error: error.message 
          });
          
          this.recordProviderFailure(provider.name);
          attempt.error = error.message;
        }
      }

      // All providers failed, wait before retry (exponential backoff)
      if (i < this.config.maxRetries - 1) {
        const delay = Math.min(
          this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, i),
          this.config.maxDelayMs
        );
        
        this.logger.info('All providers failed, retrying after delay', { 
          attemptId: attempt.id,
          delay,
          attempt: i + 1 
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // All retries exhausted
    attempt.status = EmailStatus.FAILED;
    attempt.updatedAt = new Date();
    this.attempts.set(attempt.id, attempt);
    this.emit('attemptUpdated', attempt);
    
    this.logger.error('Email failed after all retries', { attemptId: attempt.id });
  }

  /**
   * Check rate limiting
   */
  checkRateLimit() {
    const now = new Date();
    
    // Reset if time window passed
    if (now >= this.rateLimitState.resetTime) {
      this.rateLimitState.count = 0;
      this.rateLimitState.resetTime = new Date(now.getTime() + 60000);
    }

    return this.rateLimitState.count < this.config.rateLimitPerMinute;
  }

  /**
   * Increment rate limit counter
   */
  incrementRateLimit() {
    this.rateLimitState.count++;
  }

  /**
   * Circuit breaker logic
   */
  isCircuitBreakerOpen(providerName) {
    const breaker = this.circuitBreakers.get(providerName);
    if (!breaker) return false;

    const now = new Date();

    // If circuit is open, check if we should attempt half-open
    if (breaker.isOpen) {
      if (breaker.halfOpenRetryTime && now >= breaker.halfOpenRetryTime) {
        breaker.isOpen = false;
        breaker.halfOpenRetryTime = undefined;
        this.logger.info('Circuit breaker half-open', { provider: providerName });
        return false;
      }
      return true;
    }

    return false;
  }

  recordProviderSuccess(providerName) {
    const breaker = this.circuitBreakers.get(providerName);
    if (breaker) {
      breaker.failureCount = 0;
      breaker.isOpen = false;
      breaker.lastFailureTime = undefined;
      breaker.halfOpenRetryTime = undefined;
    }
  }

  recordProviderFailure(providerName) {
    const breaker = this.circuitBreakers.get(providerName);
    if (!breaker) return;

    breaker.failureCount++;
    breaker.lastFailureTime = new Date();

    if (breaker.failureCount >= this.config.circuitBreakerThreshold) {
      breaker.isOpen = true;
      breaker.halfOpenRetryTime = new Date(Date.now() + this.config.circuitBreakerResetTime);
      this.logger.warn('Circuit breaker opened', { 
        provider: providerName,
        failureCount: breaker.failureCount 
      });
    }
  }

  /**
   * Utility methods
   */
  generateId() {
    return `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  findExistingAttempt(email) {
    for (const attempt of this.attempts.values()) {
      if (
        attempt.email.to === email.to &&
        attempt.email.subject === email.subject &&
        attempt.email.body === email.body &&
        attempt.status !== EmailStatus.FAILED &&
        Date.now() - attempt.createdAt.getTime() < 300000 // 5 minutes
      ) {
        return attempt;
      }
    }
    return null;
  }

  /**
   * Public API methods
   */
  getAttempt(id) {
    return this.attempts.get(id) || null;
  }

  getAllAttempts() {
    return Array.from(this.attempts.values()).sort((a, b) => 
      b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  getProviderStatus() {
    return this.providers.map(provider => {
      const breaker = this.circuitBreakers.get(provider.name);
      let status = ProviderStatus.HEALTHY;
      
      if (breaker.isOpen) {
        status = ProviderStatus.FAILED;
      } else if (breaker.failureCount > 0) {
        status = ProviderStatus.DEGRADED;
      }

      return {
        name: provider.name,
        status,
        circuitBreaker: breaker
      };
    });
  }

  getQueueStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processingQueue
    };
  }

  getRateLimitStatus() {
    return {
      current: this.rateLimitState.count,
      limit: this.config.rateLimitPerMinute,
      resetTime: this.rateLimitState.resetTime
    };
  }

  getLogs() {
    return this.logger.getLogs();
  }

  clearLogs() {
    this.logger.clearLogs();
  }

  /**
   * Event system
   */
  on(event, listener) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event).add(listener);
  }

  off(event, listener) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  emit(event, data) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          this.logger.error('Event listener error', { event, error: error.message });
        }
      });
    }
  }
}
