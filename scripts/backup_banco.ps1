param (
    [string]$DestFolder = "H:\.shortcut-targets-by-id\1AsrTvvPm8KESPGEM4ejkMKqx2Yeqo_Uu\DIEIP 2026\- IGOR -\BACKUP - Banco de Dados",
    [int]$RetentionDays = 15
)

# Forçar saída em UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  ROTINA DE BACKUP - BANCO DE DADOS (OS) " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Data e Hora: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

# 1. Verificar se a pasta de destino no Google Drive existe
if (-not (Test-Path -Path $DestFolder)) {
    Write-Host "[ERRO] Pasta de destino no Google Drive não foi encontrada:" -ForegroundColor Red
    Write-Host "       $DestFolder" -ForegroundColor Red
    Write-Host "Verifique se o Google Drive está conectado e acessível."
    exit 1
}

# 2. Verificar se o container do banco está rodando
$containerName = "supabase-db"
$containerRunning = docker ps --filter "name=^/${containerName}$" --format "{{.Names}}"

if (-not $containerRunning) {
    Write-Host "[ERRO] O container '$containerName' não está em execução no Docker!" -ForegroundColor Red
    Write-Host "Certifique-se de que o Docker e o banco de dados estão ativos."
    exit 1
}

# 3. Gerar Dump compactado
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$fileName = "backup_sistema_os_$timestamp.sql.gz"
$destFilePath = Join-Path $DestFolder $fileName
$tempContainerFile = "/tmp/$fileName"

Write-Host "[1/3] Gerando dump do banco e compactando (gzip)..." -ForegroundColor Yellow

try {
    # Executa o dump diretamente compactado dentro do container para velocidade máxima
    $dumpCmd = "pg_dump -U postgres postgres | gzip -9 > $tempContainerFile"
    docker exec $containerName /bin/sh -c $dumpCmd

    if ($LASTEXITCODE -ne 0) {
        throw "Erro durante a execução do pg_dump dentro do container."
    }

    Write-Host "[2/3] Copiando arquivo para o Google Drive..." -ForegroundColor Yellow
    docker cp "${containerName}:${tempContainerFile}" $destFilePath

    # Remove o arquivo temporário do container
    docker exec $containerName rm -f $tempContainerFile

    if ((Test-Path -Path $destFilePath) -and ((Get-Item $destFilePath).Length -gt 0)) {
        $fileSizeMB = [math]::Round(((Get-Item $destFilePath).Length / 1MB), 2)
        Write-Host "[SUCESSO] Backup gravado com sucesso no Google Drive!" -ForegroundColor Green
        Write-Host "          Arquivo: $fileName" -ForegroundColor Green
        Write-Host "          Tamanho: $fileSizeMB MB" -ForegroundColor Green
    } else {
        throw "O arquivo copiado para o Google Drive está vazio ou inacessível."
    }
} catch {
    # Garante limpeza em caso de falha
    docker exec $containerName rm -f $tempContainerFile 2>$null
    Write-Host "[ERRO] Falha ao realizar o backup: $_" -ForegroundColor Red
    exit 1
}

# 4. Limpeza de backups antigos (Retenção)
Write-Host "[3/3] Verificando backups antigos (retenção de $RetentionDays dias)..." -ForegroundColor Yellow
$limitDate = (Get-Date).AddDays(-$RetentionDays)

$oldFiles = Get-ChildItem -Path $DestFolder -Filter "backup_sistema_os_*.sql.gz" | Where-Object {
    $_.LastWriteTime -lt $limitDate
}

if ($oldFiles) {
    foreach ($file in $oldFiles) {
        Write-Host "      Removendo backup antigo: $($file.Name) (Criado em $($file.LastWriteTime))" -ForegroundColor DarkGray
        Remove-Item -Path $file.FullName -Force
    }
} else {
    Write-Host "      Nenhum backup com mais de $RetentionDays dias para remoção." -ForegroundColor DarkGray
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Rotina finalizada com sucesso!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
