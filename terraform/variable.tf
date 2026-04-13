variable "aws_region" {
  description = "AWS region to deploy into"
  default     = "ap-south-1"
}

variable "project" {
  description = "Project name prefix for all resources"
  default     = "feedreader"
}

variable "github_repo" {
  description = "Public GitHub repo URL (https://github.com/you/feedreader)"
  type        = string
  default = "https://github.com/Mdskun/RSSS.git"
}

variable "key_name" {
  description = "Name of an existing EC2 key pair for SSH access"
  type        = string
  default = "k2"
}

variable "instance_type" {
  description = "EC2 instance type"
  default     = "t2.micro"
}

variable "db_instance_class" {
  description = "RDS instance class"
  default     = "db.t3.micro"
}

variable "db_user" {
  default = "rssuser"
}

variable "db_pass" {
  description = "RDS master password"
  default     = "RssP@ss2024!"
  sensitive   = true
}

variable "db_name" {
  default = "rssdb"
}