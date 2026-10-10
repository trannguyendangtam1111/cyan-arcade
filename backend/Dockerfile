# syntax=docker/dockerfile:1

FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /workspace
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN --mount=type=cache,target=/root/.m2 sh ./mvnw -B -q dependency:go-offline
COPY src/ src/
RUN --mount=type=cache,target=/root/.m2 sh ./mvnw -B -q package -DskipTests \
    && mv target/cyan-arcade-backend-*.jar target/app.jar

# Stockfish, the chess engine: the official release, pinned by version and SHA-256 (GitHub's published
# digest of the asset), downloaded when the image is built, never when the application starts. The
# release archive carries the GPL-3.0 licence and the source code, which are kept next to the binary
# (the evaluation network is embedded in the binary; see THIRD_PARTY_NOTICES.md). Other architectures: pass the asset name and its digest (see tools/stockfish/README.md).
FROM alpine:3.22 AS stockfish
ARG STOCKFISH_VERSION=19
ARG STOCKFISH_ASSET=stockfish-linux-x86-64-universal
ARG STOCKFISH_SHA256=9defc0d4e55d49c65a6d042f3e571a39fcea499ade6dbe741b53b8c65e03611f
RUN apk add --no-cache curl \
    && curl -fsSL -o /tmp/stockfish.tar.gz \
       "https://github.com/official-stockfish/Stockfish/releases/download/sf_${STOCKFISH_VERSION}/${STOCKFISH_ASSET}.tar.gz" \
    && echo "${STOCKFISH_SHA256}  /tmp/stockfish.tar.gz" | sha256sum -c - \
    && tar xzf /tmp/stockfish.tar.gz -C /opt \
    && mv "/opt/stockfish/${STOCKFISH_ASSET}" /opt/stockfish/stockfish \
    && chmod 755 /opt/stockfish/stockfish \
    && rm -rf /tmp/stockfish.tar.gz /opt/stockfish/wiki

# A glibc runtime: the official Linux build of Stockfish is linked against glibc, so not Alpine.
FROM eclipse-temurin:21-jre-noble
WORKDIR /app
RUN groupadd --system arcade && useradd --system --gid arcade --no-create-home --shell /usr/sbin/nologin arcade
COPY --from=stockfish /opt/stockfish /opt/stockfish
COPY --from=build /workspace/target/app.jar app.jar
ENV STOCKFISH_PATH=/opt/stockfish/stockfish
USER arcade
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=40s --retries=5 \
    CMD wget -qO- http://localhost:8080/actuator/health/readiness | grep -q '"UP"' || exit 1
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
