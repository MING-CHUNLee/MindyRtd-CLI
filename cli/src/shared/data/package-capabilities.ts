/**
 * Static Data: Package Capabilities Mapping
 * 
 * Maps popular R packages to their capabilities.
 * This helps LLM understand what operations are available based on installed packages.
 * 
 * Reference: This structure is inspired by package metadata systems like
 * npm's package.json keywords and R's DESCRIPTION file structure.
 */

/**
 * Maps R package names to their capabilities
 */
export const PACKAGE_CAPABILITIES: Record<string, string[]> = {
    // Tidyverse core
    'dplyr': ['data manipulation', 'filtering', 'grouping', 'summarizing', 'joining datasets'],
    'ggplot2': ['data visualization', 'charts', 'plots', 'graphs'],
    'tidyr': ['data tidying', 'pivoting', 'reshaping data'],
    'readr': ['reading CSV files', 'reading text files', 'parsing data'],
    'purrr': ['functional programming', 'list operations', 'mapping functions'],
    'tibble': ['modern data frames', 'tibbles'],
    'stringr': ['string manipulation', 'text processing', 'regex'],
    'forcats': ['factor manipulation', 'categorical data'],
    'lubridate': ['date/time manipulation', 'parsing dates'],

    // Data import/export
    'readxl': ['reading Excel files', 'xlsx import'],
    'writexl': ['writing Excel files', 'xlsx export'],
    'haven': ['reading SPSS/Stata/SAS files'],
    'jsonlite': ['JSON parsing', 'JSON export'],
    'xml2': ['XML parsing'],

    // Statistics & Modeling
    'stats': ['basic statistics', 't-tests', 'ANOVA', 'regression', 'correlation'],
    'lme4': ['mixed effects models', 'hierarchical models'],
    'car': ['regression diagnostics', 'ANOVA'],
    'broom': ['tidying model outputs'],
    'caret': ['machine learning', 'model training', 'cross-validation'],
    'randomForest': ['random forest models'],
    'xgboost': ['gradient boosting', 'XGBoost models'],

    // Visualization
    'plotly': ['interactive plots', 'web visualizations'],
    'leaflet': ['interactive maps', 'geospatial visualization'],
    'shiny': ['web applications', 'dashboards', 'interactive apps'],
    'rmarkdown': ['reports', 'documents', 'notebooks'],
    'knitr': ['report generation', 'code chunks'],

    // Database
    'DBI': ['database connections', 'SQL queries'],
    'RSQLite': ['SQLite databases'],
    'RMySQL': ['MySQL databases'],
    'RPostgres': ['PostgreSQL databases'],

    // Other common
    'httr': ['HTTP requests', 'API calls'],
    'rvest': ['web scraping', 'HTML parsing'],
    'testthat': ['unit testing'],
    'devtools': ['package development'],
};

/**
 * Key packages that indicate specific analysis capability categories
 */
export const KEY_PACKAGE_GROUPS: Record<string, string[]> = {
    'data_manipulation': ['dplyr', 'tidyr', 'data.table'],
    'visualization': ['ggplot2', 'plotly', 'lattice'],
    'statistics': ['stats', 'lme4', 'car', 'MASS'],
    'machine_learning': ['caret', 'randomForest', 'xgboost', 'e1071'],
    'reporting': ['rmarkdown', 'knitr', 'shiny'],
    'io': ['readr', 'readxl', 'haven', 'jsonlite'],
};

/**
 * Tidyverse core packages for detection
 */
export const TIDYVERSE_CORE = ['dplyr', 'ggplot2', 'tidyr', 'readr', 'purrr', 'tibble'];

/**
 * Important/popular packages to highlight
 */
export const IMPORTANT_PACKAGES = [
    'shiny', 'rmarkdown', 'knitr', 'data.table',
    'caret', 'randomForest', 'plotly', 'DBI'
];
