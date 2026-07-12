FROM golang:1.22 AS build

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o shipyard-server

FROM gcr.io/distroless/base-debian12
WORKDIR /app

COPY --from=build /app/shipyard-server .

ENV PORT=8080
EXPOSE 8080

CMD ["./shipyard-server"]
