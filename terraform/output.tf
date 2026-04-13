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

output "db_private_ip" {
  value = aws_instance.db.private_ip
}