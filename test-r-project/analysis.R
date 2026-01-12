# Sample R Script for Testing
# This script demonstrates basic R functionality

# Load libraries
library(tidyverse)
library(ggplot2)

# Create sample data
data <- data.frame(
  x = 1:10,
  y = rnorm(10, mean = 5, sd = 2)
)

# Simple analysis
summary(data)
mean(data$y)
sd(data$y)

# Create a plot
ggplot(data, aes(x = x, y = y)) +
  geom_point() +
  geom_smooth(method = "lm") +
  theme_minimal() +
  labs(title = "Sample Plot", x = "X Value", y = "Y Value")

# Save results
write.csv(data, "output.csv")
