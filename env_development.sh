export NODE_ENV="development" # Configs are chosen based on this.

# Run multiple processes of Node 
export MULTI_CORE="false"
export MULTI_CORE_COUNT="2" #If this is not specified or 0 , then defaults to system cores

export SUPERADMIN_USERNAME=super_admin
export SUPERADMIN_PASSWORD=caef6db9da0aac1df0d8e247ccd3469ad77f90379e50c9574d215b7970118d1a
export JWT_SECRET=secret_secret_secret

# Domain
domain=dsolitaire.in
export DOMAIN=${domain}
# SMTP
export SMTP_USER="bizgaze"
export SMTP_PASSWORD="f7d974018dd981e47e00c5718d86223790249c66281c0acc63188a9f1aec9b29"

# Process name
export PROCESS_NAME=${domain}_ES