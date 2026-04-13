output "website_url" {
  description = "Public URL of the FeedReader website"
  value       = "http://${aws_lb.web.dns_name}"
}

output "web_alb_dns" {
  value = aws_lb.web.dns_name
}

output "app_alb_dns" {
  value = aws_lb.app.dns_name
}

output "rds_endpoint" {
  description = "RDS MySQL endpoint (private, accessible from app tier only)"
  value       = aws_db_instance.main.address
}

output "rds_port" {
  value = aws_db_instance.main.port
}