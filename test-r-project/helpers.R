# Helper Functions
# Utility functions for data processing

clean_data <- function(df) {
  df %>%
    na.omit() %>%
    mutate_if(is.character, trimws)
}

calculate_stats <- function(x) {
  list(
    mean = mean(x, na.rm = TRUE),
    sd = sd(x, na.rm = TRUE),
    median = median(x, na.rm = TRUE)
  )
}
