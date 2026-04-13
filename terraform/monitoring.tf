# ─── SNS Topic ────────────────────────────────────────────────────────────────

resource "aws_sns_topic" "alerts" {
  name = "${var.project}-cpu-alerts"
  tags = { Name = "${var.project}-cpu-alerts" }
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# ─── CloudWatch Alarms — App EC2 A ────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "app_a_cpu_high" {
  alarm_name          = "${var.project}-app-a-cpu-high"
  alarm_description   = "App EC2-A CPU has exceeded ${var.cpu_alarm_threshold}% for 10 minutes"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2 # 2 x 5 min = 10 min sustained
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300 # 5 minutes per datapoint
  statistic           = "Average"
  threshold           = var.cpu_alarm_threshold
  treat_missing_data  = "notBreaching"

  dimensions = {
    InstanceId = aws_instance.app_a.id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn] # also notify when CPU recovers

  tags = { Name = "${var.project}-app-a-cpu-alarm" }
}

resource "aws_cloudwatch_metric_alarm" "app_a_cpu_critical" {
  alarm_name          = "${var.project}-app-a-cpu-critical"
  alarm_description   = "CRITICAL: App EC2-A CPU above 90% for 5 minutes"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 90
  treat_missing_data  = "notBreaching"

  dimensions = {
    InstanceId = aws_instance.app_a.id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]

  tags = { Name = "${var.project}-app-a-cpu-critical" }
}

# ─── CloudWatch Alarms — App EC2 B ────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "app_b_cpu_high" {
  alarm_name          = "${var.project}-app-b-cpu-high"
  alarm_description   = "App EC2-B CPU has exceeded ${var.cpu_alarm_threshold}% for 10 minutes"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = var.cpu_alarm_threshold
  treat_missing_data  = "notBreaching"

  dimensions = {
    InstanceId = aws_instance.app_b.id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = { Name = "${var.project}-app-b-cpu-alarm" }
}

resource "aws_cloudwatch_metric_alarm" "app_b_cpu_critical" {
  alarm_name          = "${var.project}-app-b-cpu-critical"
  alarm_description   = "CRITICAL: App EC2-B CPU above 90% for 5 minutes"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 90
  treat_missing_data  = "notBreaching"

  dimensions = {
    InstanceId = aws_instance.app_b.id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]

  tags = { Name = "${var.project}-app-b-cpu-critical" }
}

# ─── CloudWatch Dashboard ─────────────────────────────────────────────────────

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project}-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "App EC2 CPU Utilization"
          period = 300
          stat   = "Average"
          view   = "timeSeries"
          metrics = [
            ["AWS/EC2", "CPUUtilization", "InstanceId", aws_instance.app_a.id, { label = "App EC2-A" }],
            ["AWS/EC2", "CPUUtilization", "InstanceId", aws_instance.app_b.id, { label = "App EC2-B" }],
          ]
          annotations = {
            horizontal = [
              { label = "Warning", value = var.cpu_alarm_threshold, color = "#ff9900" },
              { label = "Critical", value = 90, color = "#d62728" }
            ]
          }
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Web EC2 CPU Utilization"
          period = 300
          stat   = "Average"
          view   = "timeSeries"
          metrics = [
            ["AWS/EC2", "CPUUtilization", "InstanceId", aws_instance.web_a.id, { label = "Web EC2-A" }],
            ["AWS/EC2", "CPUUtilization", "InstanceId", aws_instance.web_b.id, { label = "Web EC2-B" }],
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "App ALB — Request Count"
          period = 60
          stat   = "Sum"
          view   = "timeSeries"
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.app.arn_suffix, { label = "App ALB Requests" }],
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.web.arn_suffix, { label = "Web ALB Requests" }],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "App ALB — Target Response Time (ms)"
          period = 60
          stat   = "Average"
          view   = "timeSeries"
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.app.arn_suffix, { label = "App ALB Latency" }],
          ]
        }
      },
      {
        type   = "alarm"
        x      = 0
        y      = 12
        width  = 24
        height = 3
        properties = {
          title = "Active Alarms"
          alarms = [
            aws_cloudwatch_metric_alarm.app_a_cpu_high.arn,
            aws_cloudwatch_metric_alarm.app_a_cpu_critical.arn,
            aws_cloudwatch_metric_alarm.app_b_cpu_high.arn,
            aws_cloudwatch_metric_alarm.app_b_cpu_critical.arn,
          ]
        }
      }
    ]
  })
}
