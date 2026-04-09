#!/bin/bash

# ============================================
# Discord Selfbot Pro - Script de Instalación
# ============================================

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funciones
print_header() {
  echo -e "${BLUE}"
  echo "============================================"
  echo "  🤖 Discord Selfbot Pro v2.0"
  echo "  Script de Instalación"
  echo "============================================"
  echo -e "${NC}"
}

print_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
  echo -e "${RED}❌ $1${NC}"
}

print_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

# Verificar Node.js
check_node() {
  print_info "Verificando Node.js..."
  
  if ! command -v node &> /dev/null; then
    print_error "Node.js no está instalado"
    echo "Por favor instala Node.js 18+ desde: https://nodejs.org/"
    exit 1
  fi
  
  NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  
  if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js 18+ requerido. Versión actual: $(node -v)"
    exit 1
  fi
  
  print_success "Node.js $(node -v) detectado"
}

# Verificar NPM
check_npm() {
  print_info "Verificando NPM..."
  
  if ! command -v npm &> /dev/null; then
    print_error "NPM no está instalado"
    exit 1
  fi
  
  print_success "NPM $(npm -v) detectado"
}

# Instalar dependencias
install_dependencies() {
  print_info "Instalando dependencias..."
  
  if [ -d "node_modules" ]; then
    print_warning "node_modules ya existe. ¿Eliminar y reinstalar? (s/n)"
    read -r response
    if [[ "$response" =~ ^([sS][iI]|[sS])$ ]]; then
      rm -rf node_modules
    fi
  fi
  
  npm install
  print_success "Dependencias instaladas"
}

# Configurar entorno
setup_env() {
  print_info "Configurando entorno..."
  
  if [ -f ".env" ]; then
    print_warning ".env ya existe. ¿Sobrescribir? (s/n)"
    read -r response
    if [[ ! "$response" =~ ^([sS][iI]|[sS])$ ]]; then
      print_info "Conservando .env existente"
      return
    fi
  fi
  
  cp .env.example .env
  
  print_info "Por favor configura tu token de Discord:"
  echo -n "Token: "
  read -r token
  
  print_info "Por favor configura el ID del canal base:"
  echo -n "Channel ID (default: 1374565606967214100): "
  read -r channel_id
  channel_id=${channel_id:-1374565606967214100}
  
  # Reemplazar en .env
  sed -i "s|DISCORD_TOKEN=.*|DISCORD_TOKEN=$token|" .env
  sed -i "s|BASE_CHANNEL_ID=.*|BASE_CHANNEL_ID=$channel_id|" .env
  
  print_success "Archivo .env configurado"
}

# Compilar TypeScript
build_project() {
  print_info "Compilando TypeScript..."
  npm run build
  print_success "Proyecto compilado"
}

# Instalar PM2
install_pm2() {
  print_info "Verificando PM2..."
  
  if ! command -v pm2 &> /dev/null; then
    print_info "Instalando PM2 globalmente..."
    npm install -g pm2
    print_success "PM2 instalado"
  else
    print_success "PM2 ya está instalado"
  fi
}

# Crear directorios necesarios
create_directories() {
  print_info "Creando directorios..."
  
  mkdir -p logs
  mkdir -p config
  
  print_success "Directorios creados"
}

# Mensaje final
print_final() {
  echo ""
  echo -e "${GREEN}============================================"
  echo "  🎉 Instalación Completada!"
  echo "============================================${NC}"
  echo ""
  echo "Comandos disponibles:"
  echo "  npm run dev          - Ejecutar en desarrollo"
  echo "  npm run build        - Compilar TypeScript"
  echo "  npm run start        - Ejecutar versión compilada"
  echo "  npm run pm2:start    - Iniciar con PM2 (producción)"
  echo "  npm run pm2:logs     - Ver logs"
  echo "  npm run dashboard    - Iniciar dashboard web"
  echo ""
  echo -e "${YELLOW}⚠️  Recuerda: Los selfbots violan los TOS de Discord"
  echo "   Úsalo bajo tu propio riesgo.${NC}"
  echo ""
}

# ============================================
# EJECUCIÓN PRINCIPAL
# ============================================

print_header
check_node
check_npm
create_directories
install_dependencies
setup_env
build_project
install_pm2
print_final
