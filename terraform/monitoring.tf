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
  alarm_description   = "App EC2-A CPU >= ${var.cpu_alarm_threshold}% for 10 min"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = var.cpu_alarm_threshold
  treat_missing_data  = "notBreaching"
  dimensions          = { InstanceId = aws_instance.app_a.id }
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  tags                = { Name = "${var.project}-app-a-cpu-high" }
}

resource "aws_cloudwatch_metric_alarm" "app_a_cpu_critical" {
  alarm_name          = "${var.project}-app-a-cpu-critical"
  alarm_description   = "CRITICAL: App EC2-A CPU >= 90% for 5 min"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 90
  treat_missing_data  = "notBreaching"
  dimensions          = { InstanceId = aws_instance.app_a.id }
  alarm_actions       = [aws_sns_topic.alerts.arn]
  tags                = { Name = "${var.project}-app-a-cpu-critical" }
}

# ─── CloudWatch Alarms — App EC2 B ────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "app_b_cpu_high" {
  alarm_name          = "${var.project}-app-b-cpu-high"
  alarm_description   = "App EC2-B CPU >= ${var.cpu_alarm_threshold}% for 10 min"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = var.cpu_alarm_threshold
  treat_missing_data  = "notBreaching"
  dimensions          = { InstanceId = aws_instance.app_b.id }
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  tags                = { Name = "${var.project}-app-b-cpu-high" }
}

resource "aws_cloudwatch_metric_alarm" "app_b_cpu_critical" {
  alarm_name          = "${var.project}-app-b-cpu-critical"
  alarm_description   = "CRITICAL: App EC2-B CPU >= 90% for 5 min"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 90
  treat_missing_data  = "notBreaching"
  dimensions          = { InstanceId = aws_instance.app_b.id }
  alarm_actions       = [aws_sns_topic.alerts.arn]
  tags                = { Name = "${var.project}-app-b-cpu-critical" }
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
          title   = "App EC2 — CPU Utilization"
          region  = var.aws_region
          period  = 300
          stat    = "Average"
          view    = "timeSeries"
          stacked = false
          metrics = [
            ["AWS/EC2", "CPUUtilization", "InstanceId", aws_instance.app_a.id, { "label" = "App EC2-A" }],
            ["AWS/EC2", "CPUUtilization", "InstanceId", aws_instance.app_b.id, { "label" = "App EC2-B" }],
          ]
          annotations = {
            horizontal = [
              { label = "Warning", value = var.cpu_alarm_threshold, color = "#ff9900" },
              { label = "Critical", value = 90, color = "#d62728" }
            ]
          }
          yAxis = { left = { min = 0, max = 100 } }
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "Web EC2 — CPU Utilization"
          region  = var.aws_region
          period  = 300
          stat    = "Average"
          view    = "timeSeries"
          stacked = false
          metrics = [
            ["AWS/EC2", "CPUUtilization", "InstanceId", aws_instance.web_a.id, { "label" = "Web EC2-A" }],
            ["AWS/EC2", "CPUUtilization", "InstanceId", aws_instance.web_b.id, { "label" = "Web EC2-B" }],
          ]
          annotations = {
            horizontal = []
          }
          yAxis = { left = { min = 0, max = 100 } }
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "ALB — Request Count (per min)"
          region  = var.aws_region
          period  = 60
          stat    = "Sum"
          view    = "timeSeries"
          stacked = false
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.app.arn_suffix, { "label" = "App ALB" }],
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.web.arn_suffix, { "label" = "Web ALB" }],
          ]
          annotations = {
            horizontal = []
          }
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "App ALB — Target Response Time (avg)"
          region  = var.aws_region
          period  = 60
          stat    = "Average"
          view    = "timeSeries"
          stacked = false
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.app.arn_suffix, { "label" = "Latency (s)" }],
          ]
          annotations = {
            horizontal = []
          }
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
