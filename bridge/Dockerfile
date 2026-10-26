# syntax=docker/dockerfile:1
FROM golang:1.26.10-bookworm AS tools
ENV CGO_ENABLED=0
WORKDIR /bridge
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .

# Linux build for the e2e stack (compose.test.yaml): needs a shell and curl, so it stays on the Go image.
FROM tools AS runtime
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    go build -trimpath -ldflags "-s -w -X main.version=test" -o /usr/local/bin/chalk-terminal . \
 && useradd --create-home --uid 10001 chalk
USER chalk
WORKDIR /home/chalk
EXPOSE 7681
ENTRYPOINT ["/usr/local/bin/chalk-terminal"]
