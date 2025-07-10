/**
 * Comprehensive test suite for EmailService
 * Tests all major features including resilience patterns
 */

import { EmailService, MockEmailProvider, EmailStatus, ProviderStatus } from '../EmailService';

describe('EmailService', () => {
  let emailService;
  let provider1;
  let provider2;

  beforeEach(() => {
    provider1 = new MockEmailProvider('Provider1', 0, 10); // No failures, fast
    provider2 = new MockEmailProvider('Provider2', 0, 10); // No failures, fast
    emailService = new EmailService([provider1, provider2], {
      maxRetries: 3,
      initialDelayMs: 10,
      maxDelayMs: 100,
      backoffMultiplier: 2,
      circuitBreakerThreshold: 2,
      circuitBreakerResetTime: 1000,
      rateLimitPerMinute: 10
    });
  });

  describe('Basic Email Sending', () => {
    test('should successfully send email with healthy provider', async () => {
      const emailData = {
        to: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test Body'
      };

      const attemptId = await emailService.sendEmail(emailData);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const attempt = emailService.getAttempt(attemptId);
      expect(attempt).toBeTruthy();
      expect(attempt.status).toBe(EmailStatus.SENT);
      expect(attempt.messageId).toBeTruthy();
      expect(attempt.provider).toBeTruthy();
    });

    test('should generate unique attempt IDs', async () => {
      const emailData = {
        to: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test Body'
      };

      const id1 = await emailService.sendEmail(emailData);
      const id2 = await emailService.sendEmail({ ...emailData, to: 'test2@example.com' });
      
      expect(id1).not.toBe(id2);
    });
  });

  describe('Idempotency', () => {
    test('should prevent duplicate email sends', async () => {
      const emailData = {
        to: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test Body'
      };

      const id1 = await emailService.sendEmail(emailData);
      const id2 = await emailService.sendEmail(emailData);
      
      expect(id1).toBe(id2);
      
      const attempts = emailService.getAllAttempts();
      expect(attempts.length).toBe(1);
    });

    test('should allow duplicate sends after time window', async () => {
      const originalDate = Date.now;
      Date.now = jest.fn(() => 1000);

      const emailData = {
        to: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test Body'
      };

      const id1 = await emailService.sendEmail(emailData);
      
      // Move time forward beyond idempotency window (5 minutes)
      Date.now = jest.fn(() => 1000 + 301000);
      
      const id2 = await emailService.sendEmail(emailData);
      
      expect(id1).not.toBe(id2);
      
      Date.now = originalDate;
    });
  });

  describe('Retry Logic', () => {
    test('should retry failed attempts with exponential backoff', async () => {
      provider1.setFailureRate(1); // Always fail
      provider2.setFailureRate(1); // Always fail

      const emailData = {
        to: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test Body'
      };

      const attemptId = await emailService.sendEmail(emailData);
      
      // Wait for all retries to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const attempt = emailService.getAttempt(attemptId);
      expect(attempt.status).toBe(EmailStatus.FAILED);
      expect(attempt.attempts).toBe(3); // maxRetries
    });

    test('should succeed on retry when provider recovers', async () => {
      provider1.setFailureRate(1); // Always fail initially
      provider2.setFailureRate(1); // Always fail initially

      const emailData = {
        to: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test Body'
      };

      const attemptId = await emailService.sendEmail(emailData);
      
      // Wait a bit, then make one provider healthy
      setTimeout(() => {
        provider1.setFailureRate(0);
      }, 50);
      
      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const attempt = emailService.getAttempt(attemptId);
      expect(attempt.status).toBe(EmailStatus.SENT);
    });
  });

  describe('Fallback Mechanism', () => {
    test('should fallback to second provider when first fails', async () => {
      provider1.setFailureRate(1); // First provider always fails
      provider2.setFailureRate(0); // Second provider always succeeds

      const emailData = {
        to: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test Body'
      };

      const attemptId = await emailService.sendEmail(emailData);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const attempt = emailService.getAttempt(attemptId);
      expect(attempt.status).toBe(EmailStatus.SENT);
      expect(attempt.provider).toBe('Provider2');
    });
  });

  describe('Circuit Breaker', () => {
    test('should open circuit breaker after failure threshold', async () => {
      provider1.setFailureRate(1); // Always fail
      
      const emailData = {
        to: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test Body'
      };

      // Send enough emails to trigger circuit breaker
      await emailService.sendEmail(emailData);
      await emailService.sendEmail({ ...emailData, to: 'test2@example.com' });
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const providerStatus = emailService.getProviderStatus();
      const provider1Status = providerStatus.find(p => p.name === 'Provider1');
      
      expect(provider1Status.circuitBreaker.isOpen).toBe(true);
    });

    test('should reset circuit breaker after timeout', async () => {
      provider1.setFailureRate(1); // Start with failures
      
      const emailData = {
        to: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test Body'
      };

      // Trigger circuit breaker
      await emailService.sendEmail(emailData);
      await emailService.sendEmail({ ...emailData, to: 'test2@example.com' });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Make provider healthy and wait for circuit breaker reset
      provider1.setFailureRate(0);
      await new Promise(resolve => setTimeout(resolve, 1100)); // Wait for reset time
      
      // Try sending again
      const attemptId = await emailService.sendEmail({ ...emailData, to: 'test3@example.com' });
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const attempt = emailService.getAttempt(attemptId);
      expect(attempt.status).toBe(EmailStatus.SENT);
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limits', async () => {
      const emailData = {
        to: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test Body'
      };

      // Send emails up to the limit
      const promises = [];
      for (let i = 0; i < 11; i++) { // Limit is 10
        promises.push(
          emailService.sendEmail({ ...emailData, to: `test${i}@example.com` })
            .catch(error => error.message)
        );
      }

      const results = await Promise.all(promises);
      
      // Last email should be rate limited
      expect(results[10]).toContain('Rate limit exceeded');
    });

    test('should reset rate limit after time window', async () => {
      const originalDate = Date.now;
      let currentTime = 1000;
      Date.now = jest.fn(() => currentTime);

      const emailData = {
        to: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test Body'
      };

      // Fill up rate limit
      for (let i = 0; i < 10; i++) {
        await emailService.sendEmail({ ...emailData, to: `test${i}@example.com` });
      }

      // Move time forward to reset rate limit
      currentTime += 61000; // 61 seconds
      
      // This should succeed now
      const attemptId = await emailService.sendEmail({ ...emailData, to: 'test10@example.com' });
      expect(attemptId).toBeTruthy();
      
      Date.now = originalDate;
    });
  });

  describe('Status Tracking', () => {
    test('should track email attempt lifecycle', async () => {
      const emailData = {
        to: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test Body'
      };

      const attemptId = await emailService.sendEmail(emailData);
      const initialAttempt = emailService.getAttempt(attemptId);
      
      expect(initialAttempt.status).toBe(EmailStatus.QUEUED);
      expect(initialAttempt.attempts).toBe(0);
      expect(initialAttempt.createdAt).toBeTruthy();
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const finalAttempt = emailService.getAttempt(attemptId);
      expect(finalAttempt.status).toBe(EmailStatus.SENT);
      expect(finalAttempt.attempts).toBe(1);
      expect(finalAttempt.sentAt).toBeTruthy();
      expect(finalAttempt.messageId).toBeTruthy();
    });

    test('should provide provider status information', async () => {
      const status = emailService.getProviderStatus();
      
      expect(status).toHaveLength(2);
      expect(status[0].name).toBe('Provider1');
      expect(status[1].name).toBe('Provider2');
      expect(status[0].status).toBe(ProviderStatus.HEALTHY);
      expect(status[1].status).toBe(ProviderStatus.HEALTHY);
    });

    test('should provide queue status', async () => {
      const status = emailService.getQueueStatus();
      
      expect(status).toHaveProperty('queueLength');
      expect(status).toHaveProperty('processing');
      expect(typeof status.queueLength).toBe('number');
      expect(typeof status.processing).toBe('boolean');
    });

    test('should provide rate limit status', async () => {
      const status = emailService.getRateLimitStatus();
      
      expect(status).toHaveProperty('current');
      expect(status).toHaveProperty('limit');
      expect(status).toHaveProperty('resetTime');
      expect(typeof status.current).toBe('number');
      expect(status.limit).toBe(10);
      expect(status.resetTime).toBeInstanceOf(Date);
    });
  });

  describe('Logging', () => {
    test('should capture service logs', async () => {
      const emailData = {
        to: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test Body'
      };

      await emailService.sendEmail(emailData);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const logs = emailService.getLogs();
      expect(logs.length).toBeGreaterThan(0);
      
      const initLog = logs.find(log => log.message.includes('EmailService initialized'));
      expect(initLog).toBeTruthy();
      
      const queueLog = logs.find(log => log.message.includes('Email queued for sending'));
      expect(queueLog).toBeTruthy();
    });

    test('should clear logs when requested', async () => {
      const emailData = {
        to: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test Body'
      };

      await emailService.sendEmail(emailData);
      expect(emailService.getLogs().length).toBeGreaterThan(0);
      
      emailService.clearLogs();
      expect(emailService.getLogs().length).toBe(0);
    });
  });

  describe('Event System', () => {
    test('should emit events for attempt lifecycle', async () => {
      const events = [];
      
      emailService.on('attemptCreated', (attempt) => {
        events.push({ type: 'created', attempt });
      });
      
      emailService.on('attemptUpdated', (attempt) => {
        events.push({ type: 'updated', attempt });
      });

      const emailData = {
        to: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test Body'
      };

      await emailService.sendEmail(emailData);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe('created');
      expect(events.some(e => e.type === 'updated')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty provider list gracefully', () => {
      expect(() => {
        new EmailService([]);
      }).not.toThrow();
    });

    test('should handle malformed email data', async () => {
      const emailData = {
        to: '',
        subject: '',
        body: ''
      };

      const attemptId = await emailService.sendEmail(emailData);
      expect(attemptId).toBeTruthy();
    });

    test('should handle concurrent email sends', async () => {
      const emailData = {
        to: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test Body'
      };

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(emailService.sendEmail({ ...emailData, to: `test${i}@example.com` }));
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
      expect(new Set(results).size).toBe(5); // All should be unique
    });
  });
});

describe('MockEmailProvider', () => {
  test('should simulate failures based on failure rate', async () => {
    const provider = new MockEmailProvider('TestProvider', 1.0, 10); // 100% failure rate
    
    const emailData = {
      to: 'test@example.com',
      subject: 'Test',
      body: 'Test'
    };

    await expect(provider.sendEmail(emailData)).rejects.toThrow();
  });

  test('should simulate successful sends', async () => {
    const provider = new MockEmailProvider('TestProvider', 0.0, 10); // 0% failure rate
    
    const emailData = {
      to: 'test@example.com',
      subject: 'Test',
      body: 'Test'
    };

    const result = await provider.sendEmail(emailData);
    expect(result.success).toBe(true);
    expect(result.messageId).toBeTruthy();
  });

  test('should allow configuration changes', async () => {
    const provider = new MockEmailProvider('TestProvider', 0.0, 10);
    
    provider.setFailureRate(1.0);
    provider.setLatency(1);
    
    const emailData = {
      to: 'test@example.com',
      subject: 'Test',
      body: 'Test'
    };

    await expect(provider.sendEmail(emailData)).rejects.toThrow();
  });
});