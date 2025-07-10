import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Send, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle, 
  Activity,
  Mail,
  Settings,
  BarChart3,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  EmailService, 
  MockEmailProvider, 
  EmailStatus, 
  ProviderStatus 
} from '@/services/EmailService';
import { useToast } from '@/hooks/use-toast';

const emailService = new EmailService([
  new MockEmailProvider('SendGrid', 0.15, 800),
  new MockEmailProvider('Mailgun', 0.2, 1200)
]);

export default function EmailServiceDashboard() {
  const [emailForm, setEmailForm] = useState({
    to: '',
    subject: '',
    body: '',
    from: 'noreply@emailservice.com'
  });
  const [attempts, setAttempts] = useState([]);
  const [providerStatus, setProviderStatus] = useState([]);
  const [queueStatus, setQueueStatus] = useState({ queueLength: 0, processing: false });
  const [rateLimitStatus, setRateLimitStatus] = useState({ current: 0, limit: 100, resetTime: new Date() });
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Set up real-time updates
    const updateData = () => {
      setAttempts(emailService.getAllAttempts());
      setProviderStatus(emailService.getProviderStatus());
      setQueueStatus(emailService.getQueueStatus());
      setRateLimitStatus(emailService.getRateLimitStatus());
      setLogs(emailService.getLogs().slice(-20));
    };

    // Listen to service events
    emailService.on('attemptCreated', updateData);
    emailService.on('attemptUpdated', updateData);

    // Initial load
    updateData();

    // Set up polling for updates
    const interval = setInterval(updateData, 1000);

    return () => {
      clearInterval(interval);
      emailService.off('attemptCreated', updateData);
      emailService.off('attemptUpdated', updateData);
    };
  }, []);

  const handleSendEmail = async () => {
    if (!emailForm.to || !emailForm.subject || !emailForm.body) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const attemptId = await emailService.sendEmail(emailForm);
      toast({
        title: "Email Queued",
        description: `Email queued for delivery. Tracking ID: ${attemptId}`,
      });
      setEmailForm(prev => ({ ...prev, to: '', subject: '', body: '' }));
    } catch (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case EmailStatus.SENT:
        return <CheckCircle className="h-4 w-4 text-success" />;
      case EmailStatus.FAILED:
        return <XCircle className="h-4 w-4 text-destructive" />;
      case EmailStatus.SENDING:
        return <Activity className="h-4 w-4 text-primary animate-pulse" />;
      case EmailStatus.RATE_LIMITED:
        return <AlertTriangle className="h-4 w-4 text-warning" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadgeVariant = (status) => {
    switch (status) {
      case EmailStatus.SENT:
        return 'default';
      case EmailStatus.FAILED:
        return 'destructive';
      case EmailStatus.SENDING:
        return 'secondary';
      case EmailStatus.RATE_LIMITED:
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const getProviderStatusColor = (status) => {
    switch (status) {
      case ProviderStatus.HEALTHY:
        return 'text-success';
      case ProviderStatus.DEGRADED:
        return 'text-warning';
      case ProviderStatus.FAILED:
        return 'text-destructive';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              Email Service Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Resilient email delivery with retry logic, fallback providers, and real-time monitoring
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="flex items-center gap-1">
              <Activity className="h-3 w-3" />
              Live Status
            </Badge>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-card to-card/50 shadow-soft">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Emails</p>
                  <p className="text-2xl font-bold">{attempts.length}</p>
                </div>
                <Mail className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-card to-card/50 shadow-soft">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Success Rate</p>
                  <p className="text-2xl font-bold text-success">
                    {attempts.length > 0 
                      ? Math.round((attempts.filter(a => a.status === EmailStatus.SENT).length / attempts.length) * 100)
                      : 0
                    }%
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-success" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-card to-card/50 shadow-soft">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Queue Length</p>
                  <p className="text-2xl font-bold">{queueStatus.queueLength}</p>
                </div>
                <Clock className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-card to-card/50 shadow-soft">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Rate Limit</p>
                  <p className="text-2xl font-bold">{rateLimitStatus.current}/{rateLimitStatus.limit}</p>
                </div>
                <Zap className="h-8 w-8 text-warning" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="send" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-muted/50">
            <TabsTrigger value="send" className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              Send Email
            </TabsTrigger>
            <TabsTrigger value="status" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Status
            </TabsTrigger>
            <TabsTrigger value="providers" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Providers
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="send" className="space-y-6">
            <Card className="bg-gradient-to-br from-card to-card/50 shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5" />
                  Send New Email
                </CardTitle>
                <CardDescription>
                  Compose and send an email through the resilient delivery system
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">To</label>
                    <Input
                      type="email"
                      placeholder="recipient@example.com"
                      value={emailForm.to}
                      onChange={(e) => setEmailForm(prev => ({ ...prev, to: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">From</label>
                    <Input
                      type="email"
                      value={emailForm.from}
                      onChange={(e) => setEmailForm(prev => ({ ...prev, from: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Subject</label>
                  <Input
                    placeholder="Email subject"
                    value={emailForm.subject}
                    onChange={(e) => setEmailForm(prev => ({ ...prev, subject: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Message</label>
                  <Textarea
                    placeholder="Email content..."
                    rows={6}
                    value={emailForm.body}
                    onChange={(e) => setEmailForm(prev => ({ ...prev, body: e.target.value }))}
                  />
                </div>
                <Button 
                  onClick={handleSendEmail} 
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-primary to-primary-glow hover:shadow-glow transition-all duration-300"
                >
                  {isLoading ? (
                    <>
                      <Activity className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send Email
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="status" className="space-y-6">
            {/* Rate Limiting Status */}
            <Card className="bg-gradient-to-br from-card to-card/50 shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Rate Limiting Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Current Usage</span>
                    <span className="font-medium">
                      {rateLimitStatus.current} / {rateLimitStatus.limit} emails/minute
                    </span>
                  </div>
                  <Progress 
                    value={(rateLimitStatus.current / rateLimitStatus.limit) * 100} 
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Resets at {rateLimitStatus.resetTime.toLocaleTimeString()}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Email Attempts */}
            <Card className="bg-gradient-to-br from-card to-card/50 shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Recent Email Attempts
                </CardTitle>
                <CardDescription>
                  Track the status of your email deliveries in real-time
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  <div className="space-y-3">
                    {attempts.slice(0, 10).map((attempt) => (
                      <div
                        key={attempt.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-card/80 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {getStatusIcon(attempt.status)}
                          <div>
                            <p className="font-medium">{attempt.email.to}</p>
                            <p className="text-sm text-muted-foreground">
                              {attempt.email.subject}
                            </p>
                          </div>
                        </div>
                        <div className="text-right space-y-1">
                          <Badge variant={getStatusBadgeVariant(attempt.status)}>
                            {attempt.status}
                          </Badge>
                          <p className="text-xs text-muted-foreground">
                            {attempt.attempts}/{attempt.maxAttempts} attempts
                          </p>
                          {attempt.provider && (
                            <p className="text-xs text-muted-foreground">
                              via {attempt.provider}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    {attempts.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        No email attempts yet
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="providers" className="space-y-6">
            <Card className="bg-gradient-to-br from-card to-card/50 shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Provider Status
                </CardTitle>
                <CardDescription>
                  Monitor the health and performance of email providers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {providerStatus.map((provider) => (
                    <div
                      key={provider.name}
                      className="flex items-center justify-between p-4 rounded-lg border bg-card/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-3 h-3 rounded-full",
                          provider.status === ProviderStatus.HEALTHY && "bg-success",
                          provider.status === ProviderStatus.DEGRADED && "bg-warning",
                          provider.status === ProviderStatus.FAILED && "bg-destructive"
                        )} />
                        <div>
                          <p className="font-medium">{provider.name}</p>
                          <p className={cn("text-sm capitalize", getProviderStatusColor(provider.status))}>
                            {provider.status}
                          </p>
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <Badge variant={provider.circuitBreaker.isOpen ? "destructive" : "default"}>
                          {provider.circuitBreaker.isOpen ? "Circuit Open" : "Circuit Closed"}
                        </Badge>
                        <p className="text-xs text-muted-foreground">
                          Failures: {provider.circuitBreaker.failureCount}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs" className="space-y-6">
            <Card className="bg-gradient-to-br from-card to-card/50 shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  System Logs
                </CardTitle>
                <CardDescription>
                  Real-time service activity and debugging information
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  <div className="space-y-2">
                    {logs.map((log, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-3 p-2 rounded text-sm border-b border-border/50 last:border-0"
                      >
                        <Badge 
                          variant={
                            log.level === 'ERROR' ? 'destructive' : 
                            log.level === 'WARN' ? 'outline' : 'secondary'
                          }
                          className="text-xs font-mono"
                        >
                          {log.level}
                        </Badge>
                        <div className="flex-1 space-y-1">
                          <p className="text-muted-foreground">
                            {log.timestamp.toLocaleTimeString()}
                          </p>
                          <p>{log.message}</p>
                          {log.data && (
                            <pre className="text-xs text-muted-foreground bg-muted/50 p-2 rounded overflow-auto">
                              {JSON.stringify(log.data, null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                    ))}
                    {logs.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        No logs available
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}